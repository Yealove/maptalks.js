#define SHADER_NAME TAA
precision mediump float;
#define saturate(x)        clamp(x, 0.0, 1.0)

#if defined(TARGET_METAL_ENVIRONMENT) || defined(TARGET_VULKAN_ENVIRONMENT)
#define TEXTURE_SPACE_UP    -1
#define TEXTURE_SPACE_DN     1
#else
#define TEXTURE_SPACE_UP     1
#define TEXTURE_SPACE_DN    -1
#endif

/* Clipping box type */

// min/max neighborhood
#define BOX_TYPE_AABB           0
// Variance based neighborhood
#define BOX_TYPE_VARIANCE       1
// uses both min/max and variance
#define BOX_TYPE_AABB_VARIANCE  2

// High VARIANCE_GAMMA [0.75, 1.25] increases ghosting artefact, lower values increases jittering
#define VARIANCE_GAMMA          1.0

/* Clipping algorithm */

// accurate box clipping
#define BOX_CLIPPING_ACCURATE   0
// clamping instead of clipping
#define BOX_CLIPPING_CLAMP      1
// no clipping (for debugging only)
#define BOX_CLIPPING_NONE       2

/* Configuration mobile/desktop */

#if defined(TARGET_MOBILE)
#define BOX_CLIPPING            BOX_CLIPPING_ACCURATE
#define BOX_TYPE                BOX_TYPE_VARIANCE
#define USE_YCoCg               0
#define FILTER_INPUT            1
#define FILTER_HISTORY          0
#else
#define BOX_CLIPPING            BOX_CLIPPING_ACCURATE
#define BOX_TYPE                BOX_TYPE_AABB_VARIANCE
#define USE_YCoCg               0
#define FILTER_INPUT            0
#define FILTER_HISTORY          0
#endif

/* debugging helper */

#define HISTORY_REPROJECTION    1
#define PREVENT_FLICKERING      0   // FIXME: thin lines disapear


struct MaterialParams {
    float alpha;
    mat4 reprojection;
    // float[9] filterWeights;
};
uniform sampler2D materialParams_color;
uniform sampler2D materialParams_history;
uniform vec2 materialParams_history_size;
uniform vec2 textureOutputSize;
uniform sampler2D materialParams_depth;
uniform MaterialParams materialParams;

float luminance(const vec3 linear) {
    return dot(linear, vec3(0.2126, 0.7152, 0.0722));
}

float luma(const vec3 color) {
#if USE_YCoCg
    return color.x;
#else
    return luminance(color);
#endif
}

vec3 RGB_YCoCg(const vec3 c) {
    float Y  = dot(c.rgb, vec3( 1, 2,  1) * 0.25);
    float Co = dot(c.rgb, vec3( 2, 0, -2) * 0.25);
    float Cg = dot(c.rgb, vec3(-1, 2, -1) * 0.25);
    return vec3(Y, Co, Cg);
}

vec3 YCoCg_RGB(const vec3 c) {
    float Y  = c.x;
    float Co = c.y;
    float Cg = c.z;
    float r = Y + Co - Cg;
    float g = Y + Cg;
    float b = Y - Co - Cg;
    return vec3(r, g, b);
}

// clip the (c, h) segment to a box
vec4 clipToBox(const int quality,
        const vec3 boxmin,  const vec3 boxmax, const vec4 c, const vec4 h) {
    const float epsilon = 0.0001;

    if (quality == BOX_CLIPPING_ACCURATE) {
        vec4 r = c - h;
        vec3 ir = 1.0 / (epsilon + r.rgb);
        vec3 rmax = (boxmax - h.rgb) * ir;
        vec3 rmin = (boxmin - h.rgb) * ir;
        vec3 imin = min(rmax, rmin);
        return h + r * saturate(max(max(imin.x, imin.y), imin.z));
    } else if (quality == BOX_CLIPPING_CLAMP) {
        return vec4(clamp(h.rgb, boxmin, boxmax), h.a);
    }
    return h;
}

// Samples a texture with Catmull-Rom filtering, using 9 texture fetches instead of 16.
//      https://therealmjp.github.io/
// Some optimizations from here:
//      http://vec3.ca/bicubic-filtering-in-fewer-taps/ for more details
// Optimized to 5 taps by removing the corner samples
// And modified for mediump support
vec4 sampleTextureCatmullRom(const sampler2D tex, const highp vec2 uv, const highp vec2 texSize) {
    // We're going to sample a a 4x4 grid of texels surrounding the target UV coordinate. We'll do this by rounding
    // down the sample location to get the exact center of our "starting" texel. The starting texel will be at
    // location [1, 1] in the grid, where [0, 0] is the top left corner.

    highp vec2 samplePos = uv * texSize;
    highp vec2 texPos1 = floor(samplePos - 0.5) + 0.5;

    // Compute the fractional offset from our starting texel to our original sample location, which we'll
    // feed into the Catmull-Rom spline function to get our filter weights.
    highp vec2 f = samplePos - texPos1;
    highp vec2 f2 = f * f;
    highp vec2 f3 = f2 * f;

    // Compute the Catmull-Rom weights using the fractional offset that we calculated earlier.
    // These equations are pre-expanded based on our knowledge of where the texels will be located,
    // which lets us avoid having to evaluate a piece-wise function.
    vec2 w0 = f2 - 0.5 * (f3 + f);
    vec2 w1 = 1.5 * f3 - 2.5 * f2 + 1.0;
    vec2 w3 = 0.5 * (f3 - f2);
    vec2 w2 = 1.0 - w0 - w1 - w3;

    // Work out weighting factors and sampling offsets that will let us use bilinear filtering to
    // simultaneously evaluate the middle 2 samples from the 4x4 grid.
    vec2 w12 = w1 + w2;

    // Compute the final UV coordinates we'll use for sampling the texture
    highp vec2 texPos0 = texPos1 - vec2(1.0);
    highp vec2 texPos3 = texPos1 + vec2(2.0);
    highp vec2 texPos12 = texPos1 + w2 / w12;

    highp vec2 invTexSize = 1.0 / texSize;
    texPos0  *= invTexSize;
    texPos3  *= invTexSize;
    texPos12 *= invTexSize;

    float k0 = w12.x * w0.y;
    float k1 = w0.x  * w12.y;
    float k2 = w12.x * w12.y;
    float k3 = w3.x  * w12.y;
    float k4 = w12.x * w3.y;

    vec4 result =   texture2D(tex, vec2(texPos12.x, texPos0.y)) * k0
                  + texture2D(tex, vec2(texPos0.x,  texPos12.y)) * k1
                  + texture2D(tex, vec2(texPos12.x, texPos12.y)) * k2
                  + texture2D(tex, vec2(texPos3.x,  texPos12.y)) * k3
                  + texture2D(tex, vec2(texPos12.x, texPos3.y)) * k4;

    result *= 1.0 / (k0 + k1 + k2 + k3 + k4);

    return result;
}

vec4 textureLodOffset(sampler2D tex, vec2 uv, float lod, ivec2 offset) {
    return texture2D(tex, uv + vec2(offset));
}

void main() {
    highp vec4 uv = (gl_FragCoord.xy / textureOutputSize.xy).xyxy; // interpolated to pixel center

    // read the depth buffer center sample for reprojection
    float depth = texture2D(materialParams_depth, uv.xy).r;

#if HISTORY_REPROJECTION
#if defined(TARGET_METAL_ENVIRONMENT) || defined(TARGET_VULKAN_ENVIRONMENT)
    // on metal/vulkan postProcess.normalizedUV has its origin at the left-top, but
    // our projection matrix screen-space's origin is left-bottom
    uv.w = 1.0 - uv.w;
#endif
    // reproject history to current frame
    highp vec4 q = materialParams.reprojection * vec4(uv.zw, depth, 1.0);
    uv.zw = (q.xy * (1.0 / q.w)) * 0.5 + 0.5;
#if defined(TARGET_METAL_ENVIRONMENT) || defined(TARGET_VULKAN_ENVIRONMENT)
    // on metal/vulkan after we applied the reprojection, we need to correct our uv back
    uv.w = 1.0 - uv.w;
#endif
#endif

    // read center color and history samples
    vec4 color = textureLodOffset(materialParams_color, uv.xy, 0.0, ivec2( 0,  0));
#if FILTER_HISTORY
    vec4 history = sampleTextureCatmullRom(materialParams_history, uv.zw,
            materialParams_history_size);
#else
    vec4 history = texture2D(materialParams_history, uv.zw);
#endif

#if USE_YCoCg
    history.rgb = RGB_YCoCg(history.rgb);
#endif

    // build the history clamping box
    vec3 s[9];
    s[0] = textureLodOffset(materialParams_color, uv.xy, 0.0, ivec2(-1, TEXTURE_SPACE_DN)).rgb;
    s[1] = textureLodOffset(materialParams_color, uv.xy, 0.0, ivec2( 0, TEXTURE_SPACE_DN)).rgb;
    s[2] = textureLodOffset(materialParams_color, uv.xy, 0.0, ivec2( 1, TEXTURE_SPACE_DN)).rgb;
    s[3] = textureLodOffset(materialParams_color, uv.xy, 0.0, ivec2(-1, 0)).rgb;
    s[4] = color.rgb;
    s[5] = textureLodOffset(materialParams_color, uv.xy, 0.0, ivec2( 1, 0)).rgb;
    s[6] = textureLodOffset(materialParams_color, uv.xy, 0.0, ivec2(-1, TEXTURE_SPACE_UP)).rgb;
    s[7] = textureLodOffset(materialParams_color, uv.xy, 0.0, ivec2( 0, TEXTURE_SPACE_UP)).rgb;
    s[8] = textureLodOffset(materialParams_color, uv.xy, 0.0, ivec2( 1, TEXTURE_SPACE_UP)).rgb;

#if USE_YCoCg
    for (int i = 0 ; i < 9 ; i++) {
        s[i] = RGB_YCoCg(s[i]);
    }
    color.rgb = s[4].rgb;
#endif

#if FILTER_INPUT
    // unjitter/filter input
    // vec4 filtered = vec4(0, 0, 0, color.a);
    // for (int i = 0 ; i < 9 ; i++) {
    //     filtered.rgb += s[i] * materialParams.filterWeights[i];
    // }
#else
    vec4 filtered = color;
#endif

#if BOX_TYPE == BOX_TYPE_AABB || BOX_TYPE == BOX_TYPE_AABB_VARIANCE
    vec3 boxmin = min(s[4], min(min(s[1], s[3]), min(s[5], s[7])));
    vec3 boxmax = max(s[4], max(max(s[1], s[3]), max(s[5], s[7])));
    vec3 box9min = min(boxmin, min(min(s[0], s[2]), min(s[6], s[8])));
    vec3 box9max = max(boxmax, max(max(s[0], s[2]), max(s[6], s[8])));
    // round the corners of the 3x3 box
    boxmin = (boxmin + box9min) * 0.5;
    boxmax = (boxmax + box9max) * 0.5;
#endif

#if BOX_TYPE == BOX_TYPE_VARIANCE || BOX_TYPE == BOX_TYPE_AABB_VARIANCE
    // "An Excursion in Temporal Supersampling" by Marco Salvi
    vec3 m0 = s[4];
    vec3 m1 = s[4] * s[4];
    // we use only 5 samples instead of all 9
    for (int i = 1 ; i < 9 ; i+=2) {
        m0 += s[i];
        m1 += s[i] * s[i];
    }
    vec3 a0 = m0 * (1.0 / 5.0);
    vec3 a1 = m1 * (1.0 / 5.0);
    vec3 sigma = sqrt(a1 - a0 * a0);
#if BOX_TYPE == BOX_TYPE_VARIANCE
    vec3 boxmin = a0 - VARIANCE_GAMMA * sigma;
    vec3 boxmax = a0 + VARIANCE_GAMMA * sigma;
#else
    boxmin = min(boxmin, a0 - VARIANCE_GAMMA * sigma);
    boxmax = max(boxmax, a0 + VARIANCE_GAMMA * sigma);
#endif
#endif

    // history clamping
    // history = clipToBox(BOX_CLIPPING, boxmin, boxmax, filtered, history);

    float lumaColor   = luma(filtered.rgb);
    float lumaHistory = luma(history.rgb);

    float alphaValue = materialParams.alpha;
#if PREVENT_FLICKERING
    // [Lottes] prevents flickering by modulating the blend weight by the difference in luma
    float diff = 1.0 - abs(lumaColor - lumaHistory) / (0.001 + max(lumaColor, lumaHistory));
    alphaValue *= diff * diff;
#endif

    // tonemapping for handling HDR
    filtered.rgb *= 1.0 / (1.0 + lumaColor);
    history.rgb  *= 1.0 / (1.0 + lumaHistory);

    // combine history and current frame
    vec4 result = mix(history, filtered, alphaValue);

    // untonemap result
    result.rgb *= 1.0 / (1.0 - luma(result.rgb));

#if USE_YCoCg
    result.rgb = YCoCg_RGB(result.rgb);
#endif

    // store result (which will becomes new history)
    // we could end-up with negative values due to the bicubic filter, which never recover on
    // their own.
    result = max(vec4(0), result);

// #if POST_PROCESS_OPAQUE
//     // kill the work performed above
//     result.a = 1.0;
// #endif

    gl_FragColor = result;
}
