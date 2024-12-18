import QuadShader from '../shader/QuadShader.js';
import vert from '../shader/glsl/quad.vert';
import frag from './glsl/ssr_mipmap.frag';

class SsrMipmapShader extends QuadShader {
    constructor() {
        super({
            vert, frag,
            extraCommandProps: {
                viewport: {
                    x: 0,
                    y: 0,
                    width: (context, props) => {
                        return props['outputSize'][0];
                    },
                    height: (context, props) => {
                        return props['outputSize'][1];
                    }
                }
            }
        });
    }

    getMeshCommand(regl, mesh) {
        if (!this.commands['ssr_mimap']) {
            this.commands['ssr_mimap'] = this.createREGLCommand(
                regl,
                null,
                mesh.getElements()
            );
        }
        return this.commands['ssr_mimap'];
    }
}

export default SsrMipmapShader;
