import BloomExtractShader from './BloomExtractShader.js';
import QuadShader from './QuadShader.js';
import quadVert from './glsl/quad.vert';
import blur0Frag from './glsl/bloom_blur0.frag';
import blur1Frag from './glsl/bloom_blur1.frag';
import blur2Frag from './glsl/bloom_blur2.frag';
import blur3Frag from './glsl/bloom_blur3.frag';
import blur4Frag from './glsl/bloom_blur4.frag';
import combineFrag from './glsl/bloom_combine.frag';
import { vec2 } from 'gl-matrix';

class BloomPass {
    constructor(renderer, viewport) {
        this._renderer = renderer;
        this._viewport = viewport;
    }

    render(sourceTex, bloomTex, bloomThreshold, extractBright, bloomFactor, bloomRadius) {
        this._initShaders();
        this._createTextures(sourceTex);
        let output = this._outputTex;
        const uniforms = this._uniforms || {
            'uRGBMRange': 7,
            'uBloomThreshold': bloomThreshold,
            'TextureInput': bloomTex,
            'uTextureInputRatio': [1, 1],
            'uTextureInputSize': [bloomTex.width, bloomTex.height],
            'uTextureOutputSize': [bloomTex.width, bloomTex.height],
            'uExtractBright': 0
        };
        uniforms['uExtractBright'] = extractBright ? 1 : 0;
        uniforms['TextureInput'] = bloomTex;
        vec2.set(uniforms['uTextureInputSize'], bloomTex.width, bloomTex.height);
        vec2.set(uniforms['uTextureOutputSize'], bloomTex.width, bloomTex.height);

        if (output.width !== bloomTex.width || output.height !== bloomTex.height) {
            this._targetFBO.resize(bloomTex.width, bloomTex.height);
        }

        this._renderer.render(this._extractShader, uniforms, null, this._targetFBO);

        //blur
        output = this._blur(this._targetFBO.color[0]);
        //combine
        output = this._combine(sourceTex, bloomTex, bloomFactor, bloomRadius);

        return output;
    }

    _blur(curTex) {
        let uniforms = this._blurUniforms;
        if (!uniforms) {
            uniforms = this._blurUniforms = {
                'uRGBMRange': 7,
                'uBlurDir': [0, 0],
                'uGlobalTexSize': [0, 0],
                'uPixelRatio': [1, 1],
                'uTextureBlurInputRatio': [1, 1],
                'uTextureBlurInputSize': [0, 0],
                'uTextureOutputRatio': [1, 1],
                'uTextureOutputSize': [0, 0],
            };
        }
        vec2.set(uniforms['uGlobalTexSize'], curTex.width, curTex.height);

        this._blurOnce(this._blur0Shader, curTex, this._blur00FBO, this._blur01FBO, 1);
        this._blurOnce(this._blur1Shader, this._blur01FBO.color[0], this._blur10FBO, this._blur11FBO, 0.5);
        this._blurOnce(this._blur2Shader, this._blur11FBO.color[0], this._blur20FBO, this._blur21FBO, 0.5);
        this._blurOnce(this._blur3Shader, this._blur21FBO.color[0], this._blur30FBO, this._blur31FBO, 0.5);
        this._blurOnce(this._blur4Shader, this._blur31FBO.color[0], this._blur40FBO, this._blur41FBO, 0.5);

        return this._blur41FBO.color[0];
    }

    _blurOnce(shader, inputTex, output0, output1, sizeRatio) {
        const w = Math.ceil(sizeRatio * inputTex.width);
        const h = Math.ceil(sizeRatio * inputTex.height);
        if (output0.width !== w || output0.height !== h) {
            output0.resize(w, h);
        }
        if (output1.width !== w || output1.height !== h) {
            output1.resize(w, h);
        }

        const uniforms = this._blurUniforms;
        uniforms['TextureBlurInput'] = inputTex;
        vec2.set(uniforms['uBlurDir'], 0, 1);
        vec2.set(uniforms['uTextureBlurInputSize'], inputTex.width, inputTex.height);
        vec2.set(uniforms['uTextureOutputSize'], output0.width, output0.height);
        this._renderer.render(shader, uniforms, null, output0);


        vec2.set(uniforms['uBlurDir'], 1, 0);
        uniforms['TextureBlurInput'] = output0.color[0];
        vec2.set(uniforms['uTextureBlurInputSize'], output0.width, output0.height);
        this._renderer.render(shader, uniforms, null, output1);
    }

    _combine(sourceTex, inputTex, bloomFactor, bloomRadius) {
        if (this._combineTex.width !== sourceTex.width || this._combineTex.height !== sourceTex.height) {
            this._combineFBO.resize(sourceTex.width, sourceTex.height);
        }

        let uniforms = this._combineUniforms;
        if (!uniforms) {
            uniforms = this._combineUniforms = {
                'uBloomFactor': 0,
                'uBloomRadius': 0,
                'uRGBMRange': 7,
                'TextureBloomBlur1': this._blur01Tex,
                'TextureBloomBlur2': this._blur11Tex,
                'TextureBloomBlur3': this._blur21Tex,
                'TextureBloomBlur4': this._blur31Tex,
                'TextureBloomBlur5': this._blur41Tex,
                'TextureInput': null,
                'TextureSource': null,
                'uTextureBloomBlur1Ratio': [1, 1],
                'uTextureBloomBlur1Size': [0, 0],
                'uTextureBloomBlur2Ratio': [1, 1],
                'uTextureBloomBlur2Size': [0, 0],
                'uTextureBloomBlur3Ratio': [1, 1],
                'uTextureBloomBlur3Size': [0, 0],
                'uTextureBloomBlur4Ratio': [1, 1],
                'uTextureBloomBlur4Size': [0, 0],
                'uTextureBloomBlur5Ratio': [1, 1],
                'uTextureBloomBlur5Size': [0, 0],
                'uTextureInputRatio': [1, 1],
                'uTextureInputSize': [0, 0],
                'uTextureOutputRatio': [1, 1],
                'uTextureOutputSize': [0, 0],
            };
        }
        uniforms['uBloomFactor'] = bloomFactor;
        uniforms['uBloomRadius'] = bloomRadius;
        uniforms['TextureInput'] = inputTex;
        uniforms['TextureSource'] = sourceTex;
        vec2.set(uniforms['uTextureBloomBlur1Size'], this._blur01Tex.width, this._blur01Tex.height);
        vec2.set(uniforms['uTextureBloomBlur2Size'], this._blur11Tex.width, this._blur11Tex.height);
        vec2.set(uniforms['uTextureBloomBlur3Size'], this._blur21Tex.width, this._blur21Tex.height);
        vec2.set(uniforms['uTextureBloomBlur4Size'], this._blur31Tex.width, this._blur31Tex.height);
        vec2.set(uniforms['uTextureBloomBlur5Size'], this._blur41Tex.width, this._blur41Tex.height);
        vec2.set(uniforms['uTextureInputSize'], sourceTex.width, sourceTex.height);
        vec2.set(uniforms['uTextureOutputSize'], sourceTex.width, sourceTex.height);

        this._renderer.render(this._combineShader, uniforms, null, this._combineFBO);
        return this._combineTex;
    }

    dispose() {
        if (this._extractShader) {
            this._extractShader.dispose();
            delete this._extractShader;
        }
        if (this._targetFBO) {
            this._targetFBO.destroy();
        }
        if (this._outputTex) {
            this._outputTex.destroy();
        }
        delete this._uniforms;
    }


    _createTextures(tex) {
        if (this._outputTex) {
            return;
        }
        const regl = this._renderer.regl;
        const output = this._outputTex = this._createColorTex(tex);
        this._targetFBO = regl.framebuffer({
            width: output.width,
            height: output.height,
            colors: [output],
            depth: false,
            stencil: false
        });

        let w = tex.width, h = tex.height;

        this._combineTex = this._createColorTex(tex, w, h, 'uint8');
        this._combineFBO = this._createBlurFBO(this._combineTex);

        this._blur00Tex = this._createColorTex(tex, w, h, 'uint8');
        this._blur00FBO = this._createBlurFBO(this._blur00Tex);
        this._blur01Tex = this._createColorTex(tex);
        this._blur01FBO = this._createBlurFBO(this._blur01Tex);

        w = Math.ceil(w / 2);
        h = Math.ceil(h / 2);
        this._blur10Tex = this._createColorTex(tex, w, h, 'uint8');
        this._blur10FBO = this._createBlurFBO(this._blur10Tex);
        this._blur11Tex = this._createColorTex(tex, w, h, 'uint8');
        this._blur11FBO = this._createBlurFBO(this._blur11Tex);

        w = Math.ceil(w / 2);
        h = Math.ceil(h / 2);
        this._blur20Tex = this._createColorTex(tex, w, h, 'uint8');
        this._blur20FBO = this._createBlurFBO(this._blur20Tex);
        this._blur21Tex = this._createColorTex(tex, w, h, 'uint8');
        this._blur21FBO = this._createBlurFBO(this._blur21Tex);

        w = Math.ceil(w / 2);
        h = Math.ceil(h / 2);
        this._blur30Tex = this._createColorTex(tex, w, h, 'uint8');
        this._blur30FBO = this._createBlurFBO(this._blur30Tex);
        this._blur31Tex = this._createColorTex(tex, w, h, 'uint8');
        this._blur31FBO = this._createBlurFBO(this._blur31Tex);

        w = Math.ceil(w / 2);
        h = Math.ceil(h / 2);
        this._blur40Tex = this._createColorTex(tex, w, h, 'uint8');
        this._blur40FBO = this._createBlurFBO(this._blur40Tex);
        this._blur41Tex = this._createColorTex(tex, w, h, 'uint8');
        this._blur41FBO = this._createBlurFBO(this._blur41Tex);

    }

    _createColorTex(curTex, w, h, dataType) {
        const regl = this._renderer.regl;
        const type = dataType || (regl.hasExtension('OES_texture_half_float') ? 'float16' : 'float');
        const width = w || curTex.width, height = h || curTex.height;
        const color = regl.texture({
            min: 'linear',
            mag: 'linear',
            type,
            width,
            height
        });
        return color;
    }

    _createBlurFBO(tex) {
        const regl = this._renderer.regl;
        return regl.framebuffer({
            width: tex.width,
            height: tex.height,
            colors: [tex],
            depth: false,
            stencil: false
        });
    }

    _initShaders() {
        if (!this._extractShader) {
            this._extractShader = new BloomExtractShader(this._viewport);
            const config = {
                vert: quadVert,
                uniforms: [
                    'uRGBMRange',
                    'TextureBlurInput',
                    'uBlurDir',
                    'uGlobalTexSize',
                    'uPixelRatio',
                    'uTextureBlurInputRatio',
                    'uTextureBlurInputSize',
                    'uTextureOutputRatio',
                    'uTextureOutputSize',
                ],
                extraCommandProps: {
                    viewport: this._viewport
                }
            };

            config.frag = blur0Frag;
            this._blur0Shader = new QuadShader(config);
            config.frag = blur1Frag;
            this._blur1Shader = new QuadShader(config);
            config.frag = blur2Frag;
            this._blur2Shader = new QuadShader(config);
            config.frag = blur3Frag;
            this._blur3Shader = new QuadShader(config);
            config.frag = blur4Frag;
            this._blur4Shader = new QuadShader(config);

            this._combineShader = new QuadShader({
                vert: quadVert,
                frag: combineFrag,
                uniforms: [
                    'uBloomFactor',
                    'uBloomRadius',
                    'uRGBMRange',
                    'TextureBloomBlur1',
                    'TextureBloomBlur2',
                    'TextureBloomBlur3',
                    'TextureBloomBlur4',
                    'TextureBloomBlur5',
                    'TextureInput',
                    'TextureSource',
                    'uTextureBloomBlur1Ratio',
                    'uTextureBloomBlur1Size',
                    'uTextureBloomBlur2Ratio',
                    'uTextureBloomBlur2Size',
                    'uTextureBloomBlur3Ratio',
                    'uTextureBloomBlur3Size',
                    'uTextureBloomBlur4Ratio',
                    'uTextureBloomBlur4Size',
                    'uTextureBloomBlur5Ratio',
                    'uTextureBloomBlur5Size',
                    'uTextureInputRatio',
                    'uTextureInputSize',
                    'uTextureOutputRatio',
                    'uTextureOutputSize',
                ],
                extraCommandProps: {
                    viewport: this._viewport
                }
            });
        }
    }
}

export default BloomPass;
