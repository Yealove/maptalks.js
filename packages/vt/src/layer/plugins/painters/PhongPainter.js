import * as maptalks from 'maptalks';
import { reshader } from '@maptalks/gl';
import { mat4 } from '@maptalks/gl';
import { extend, hasOwn } from '../Util';
import MeshPainter from './MeshPainter';

const pickingVert = reshader.ShaderLib.get('mesh_picking_vert');
const pickingWGSLVert = reshader.WgslShaderLib.get('mesh_picking').vert;

class PhongPainter extends MeshPainter {

    createGeometry(glData) {
        const data = glData.data;
        const symbol = this.getSymbols()[0];
        const extrusionOpacity = symbol.material && symbol.material.extrusionOpacity;
        if (extrusionOpacity) {
            const aExtrusionOpacity = new Uint8Array(data.aPosition.length / 3);
            for (let i = 0; i < data.aPosition.length; i += 3) {
                if (data.aPosition[i + 2] > 0) {
                    //top
                    aExtrusionOpacity[i / 3] = 0;
                } else {
                    aExtrusionOpacity[i / 3] = 1;
                }
            }
            data.aExtrusionOpacity = aExtrusionOpacity;
        }
        const geometry = new reshader.Geometry(data, glData.indices);
        extend(geometry.properties, glData.properties);
        this._prepareFeatureIds(geometry, glData);
        return {
            geometry,
            symbolIndex: { index: 0 }
        };
    }

    updateSceneConfig(config) {
        let needRefresh;
        if (this.sceneConfig.cullFace !== config.cullFace) {
            needRefresh = true;
        }
        extend(this.sceneConfig, config);
        if (needRefresh) {
            const config = this.getShaderConfig();
            this.shader.dispose();
            this.shader = new reshader.PhongShader(config);
        }
        this.setToRedraw();
    }

    getShader() {
        return this.shader;
    }

    delete(context) {
        this.getMap().off('updatelights', this._updateLights, this);
        super.delete(context);
        this.material.dispose();
    }

    init() {
        this.getMap().on('updatelights', this._updateLights, this);
        const regl = this.regl;

        this.renderer = new reshader.Renderer(regl);

        const config = this.getShaderConfig();

        this.shader = new reshader.PhongShader(config);

        this._updateMaterial();


        const pickingConfig = {
            vert: this.getPickingVert(),
            wgslVert: this.getPickingWGSLVert(),
            uniforms: [
                'projViewMatrix',
                'modelMatrix',
                'positionMatrix',
                {
                    name: 'projViewModelMatrix',
                    type: 'function',
                    fn: function (context, props) {
                        return mat4.multiply([], props['projViewMatrix'], props['modelMatrix']);
                    }
                }
            ],
            extraCommandProps: {
                viewport: this.pickingViewport
            }
        };
        this.picking = [new reshader.FBORayPicking(this.renderer, pickingConfig, this.layer.getRenderer().pickingFBO, this.getMap())];

    }

    _updateLights() {
        this.setToRedraw();
    }

    getShaderConfig() {
        const canvas = this.canvas;
        const viewport = {
            x: 0,
            y: 0,
            width: () => {
                return canvas ? canvas.width : 1;
            },
            height: () => {
                return canvas ? canvas.height : 1;
            }
        };
        return {
            extraCommandProps: {
                //enable cullFace
                cull: {
                    enable: () => {
                        return this.sceneConfig.cullFace === undefined || !!this.sceneConfig.cullFace;
                    },
                    face: () => {
                        let cull = this.sceneConfig.cullFace;
                        if (cull === true) {
                            cull = 'back';
                        }
                        return cull || 'back';
                    }
                },
                stencil: {
                    enable: true,
                    func: {
                        cmp: '<=',
                        ref: (context, props) => {
                            return props.level;
                        }
                    },
                    op: {
                        fail: 'keep',
                        zfail: 'keep',
                        zpass: 'replace'
                    }
                },
                depth: {
                    enable: true,
                    range: this.sceneConfig.depthRange || [0, 1],
                    func: this.sceneConfig.depthFunc || '<='
                },
                blend: {
                    enable: true,
                    func: this.getBlendFunc(),
                    equation: 'add'
                },
                viewport,
                polygonOffset: {
                    enable: true,
                    offset: this.getPolygonOffset()
                }
            }
        };
    }

    _updateMaterial() {
        if (this.material) {
            this.material.dispose();
        }
        const isVectorTile = this.layer instanceof maptalks.TileLayer;
        const materialConfig = this.getSymbols()[0].material;
        const material = {};
        for (const p in materialConfig) {
            if (hasOwn(materialConfig, p)) {
                material[p] = materialConfig[p];
                if (p === 'uvRotation') {
                    material[p] = material[p] * Math.PI / 180;
                    if (!isVectorTile) {
                        material[p] *= -1;
                    }
                }
            }
        }
        this.material = new reshader.PhongMaterial(material);
    }


    getUniformValues(map, context) {
        const viewMatrix = map.viewMatrix,
            projMatrix = map.projMatrix,
            cameraPosition = map.cameraPosition;
        const lightUniforms = this._getLightUniformValues();
        const uniforms = extend({
            viewMatrix, projMatrix, cameraPosition,
            projViewMatrix: map.projViewMatrix
        }, lightUniforms);
        if (context && context.jitter) {
            uniforms['halton'] = context.jitter;
        } else {
            uniforms['halton'] = [0, 0];
        }
        const canvas = this.layer.getRenderer().canvas;
        uniforms['outSize'] = [canvas.width, canvas.height];
        return uniforms;
    }

    getPickingVert() {
        return pickingVert;
    }

    getPickingWGSLVert() {
        return pickingWGSLVert;
    }

    _getLightUniformValues() {
        const lightManager = this.getMap().getLightManager();
        const ambientLight = lightManager && lightManager.getAmbientLight() || {};
        const directionalLight = lightManager && lightManager.getDirectionalLight() || {};

        const uniforms = {
            'ambientColor': ambientLight.color || [0.2, 0.2, 0.2],
            'light0_diffuse': [...(directionalLight.color || [0.1, 0.1, 0.1]), 1],
            'lightSpecular': directionalLight.specular || [0.8, 0.8, 0.8],
            'light0_viewDirection': directionalLight.direction || [1, 1, -1]
        };

        return uniforms;
    }

}

export default PhongPainter;
