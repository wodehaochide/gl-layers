import MeshShader from '../shader/MeshShader';
import Scene from '../Scene';
import depthVert from './glsl/depth.vert';
import depthFrag from './glsl/depth.frag';
import vert from './glsl/flood.vert';
import frag from './glsl/flood.frag';
import { isFunction } from '../common/Util';

export default class FloodPass {
    constructor(renderer, viewport) {
        this.renderer = renderer;
        this._viewport = viewport;
        this._init();
    }

    _init() {
        this._depthShader = new MeshShader({
            vert: depthVert,
            frag: depthFrag,
            extraCommandProps: {
                viewport: this._viewport
            }
        });
        this._shader = new MeshShader({
            vert,
            frag,
            extraCommandProps: {
                viewport: this._viewport
            }
        });
        this._fbo = this.renderer.regl.framebuffer({
            color: this.renderer.regl.texture({
                width: 1,
                height: 1,
                wrap: 'clamp',
                mag : 'linear',
                min : 'linear'
            }),
            depth: true
        });
    }

    render(meshes, config) {
        this._resize();
        this.renderer.clear({
            color : [0, 0, 0, 1],
            depth : 1,
            framebuffer : this._fbo
        });
        const scene = new Scene(meshes);
        this._renderScene(scene, config);
        return this._fbo;
    }

    //渲染深度贴图
    _renderScene(scene, config) {
        const uniforms = {
            projViewMatrix: config.projViewMatrix,
            flood_waterHeight: config.waterHeight
        };
        this.renderer.clear({
            color : [0, 0, 0, 1],
            depth : 1,
            framebuffer : this._fbo
        });
        this.renderer.render(
            this._shader,
            uniforms,
            scene,
            this._fbo
        );
    }

    dispose() {
        if (this._fbo) {
            this._fbo.destroy();
        }
        if (this._shader) {
            this._shader.dispose();
        }
    }

    _resize() {
        const width = isFunction(this._viewport.width.data) ? this._viewport.width.data() : this._viewport.width;
        const height = isFunction(this._viewport.height.data) ? this._viewport.height.data() : this._viewport.height;
        if (this._fbo && (this._fbo.width !== width || this._fbo.height !== height)) {
            this._fbo.resize(width, height);
        }
    }
}
