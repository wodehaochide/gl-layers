import { reshader, HeatmapProcess } from '@maptalks/gl';
import BasicPainter from './BasicPainter';
import { interpolated } from '@maptalks/function-type';
import { prepareFnTypeData } from './util/fn_type_util';
import { setUniformFromSymbol } from '../Util';

export default class HeatmapPainter extends BasicPainter {
    createFnTypeConfig(map, symbolDef) {
        const heatWeightFn = interpolated(symbolDef['heatWeight']);
        const u8 = new Int16Array(1);
        return [
            {
                attrName: 'aWeight',
                symbolName: 'heatWeight',
                type: Uint8Array,
                size: 1,
                evaluate: properties => {
                    const x = heatWeightFn(map.getZoom(), properties);
                    u8[0] = x;
                    return u8[0];
                }
            }
        ];
    }

    createMesh(geo, transform) {
        const { geometry, symbolIndex, ref } = geo;
        if (ref === undefined) {
            const symbolDef = this.getSymbolDef(symbolIndex);
            const fnTypeConfig = this.getFnTypeConfig(symbolIndex);
            prepareFnTypeData(geometry, symbolDef, fnTypeConfig);
        }

        // heatmap 只支持一个symbol
        const symbol = this.getSymbol(symbolIndex);
        const uniforms = {
            tileRatio: geometry.properties.tileRatio,
            dataResolution: geometry.properties.tileResolution
        };
        setUniformFromSymbol(uniforms, 'heatmapIntensity', symbol, 'heatmapIntensity', 1);
        setUniformFromSymbol(uniforms, 'heatmapRadius', symbol, 'heatmapRadius', 6);
        setUniformFromSymbol(uniforms, 'heatmapWeight', symbol, 'heatmapWeight', 1);
        setUniformFromSymbol(uniforms, 'heatmapOpacity', symbol, 'heatmapOpacity', 1);
        geometry.generateBuffers(this.regl);
        const material = new reshader.Material(uniforms);
        const mesh = new reshader.Mesh(geometry, material, {
            transparent: true,
            castShadow: false,
            picking: true
        });
        const defines = {};
        if (geometry.data.aWeight) {
            defines['HAS_HEAT_WEIGHT'] = 1;
        }
        mesh.setDefines(defines);
        mesh.setLocalTransform(transform);
        mesh.properties.symbolIndex = symbolIndex;
        return mesh;
    }

    callRenderer(shader, uniforms, context) {
        const fbo = this.getRenderFBO(context);
        this._process.render(this.scene, uniforms, fbo);
    }

    getUniformValues(map) {
        const symbol = this.getSymbol({ index: 0 });
        const { projViewMatrix } = map;
        return {
            glScale: 1 / map.getGLScale(),
            resolution: map.getResolution(),
            projViewMatrix,
            heatmapOpacity: symbol.heatmapOpacity
        };
    }

    getHeatmapMeshes() {
        return this.scene.getMeshes();
    }

    delete() {
        super.delete(...arguments);
        this._process.dispose();
        delete this._process;
    }

    init() {
        const regl = this.regl;
        this.renderer = new reshader.Renderer(regl);
        const enableStencil = this.layer.getRenderer().isEnableTileStencil();
        const stencil = {
            enable: true,
            mask: 0xFF,
            func: {
                cmp: () => {
                    return enableStencil ? '=' : '<=';
                },
                ref: (context, props) => {
                    return enableStencil ? props.stencilRef : props.level;
                },
                mask: 0xFF
            },
            op: {
                fail: 'keep',
                zfail: 'keep',
                zpass: () => {
                    return stencil ? 'zero' : 'replace';
                }
            }
        };
        const polygonOfffset = this.getPolygonOffset();
        const symbol = this.getSymbols()[0];
        this._process = new HeatmapProcess(this.regl, this.sceneConfig, this.layer, symbol.heatmapColor, stencil, polygonOfffset);
    }
}
