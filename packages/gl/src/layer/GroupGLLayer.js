import * as maptalks from 'maptalks';
import Renderer from './GroupGLLayerRenderer.js';
import { vec3 } from 'gl-matrix';
import { isNil } from './util/util.js';

const options = {
    renderer : 'gl',
    antialias : false,
    extensions : [

    ],
    onlyWebGL1: false,
    optionalExtensions : [
        'ANGLE_instanced_arrays',
        'OES_element_index_uint',
        'OES_standard_derivatives',
        'OES_vertex_array_object',
        'OES_texture_half_float', 'OES_texture_half_float_linear',
        'OES_texture_float', 'OES_texture_float_linear',
        'WEBGL_depth_texture', 'EXT_shader_texture_lod',
        'WEBGL_compressed_texture_s3tc'
    ],
    forceRenderOnZooming : true,
    forceRenderOnMoving : true,
    forceRenderOnRotating : true,
    viewMoveThreshold: 100
};

export default class GroupGLLayer extends maptalks.Layer {
    /**
     * Reproduce a GroupGLLayer from layer's profile JSON.
     * @param  {Object} layerJSON - layer's profile JSON
     * @return {GroupGLLayer}
     * @static
     * @private
     * @function
     */
    static fromJSON(layerJSON) {
        if (!layerJSON || layerJSON['type'] !== 'GroupGLLayer') {
            return null;
        }
        const layers = layerJSON['layers'].map(json => maptalks.Layer.fromJSON(json));
        return new GroupGLLayer(layerJSON['id'], layers, layerJSON['options']);
    }

    /**
     * @param {String|Number} id    - layer's id
     * @param {Layer[]} layers      - layers to add
     * @param {Object}  [options=null]          - construct options
     * @param {*}  [options.*=null]             - options
     */
    constructor(id, layers, options) {
        super(id, options);
        this.layers = layers || [];
        this.layers.forEach(layer => {
            if (layer.getMap()) {
                throw new Error(`layer(${layer.getId()} is already added on map`);
            }
        });
        this._checkChildren();
        this.sortLayersByZIndex();
        this._layerMap = {};
    }

    sortLayersByZIndex() {
        if (!this.layers || !this.layers.length) {
            return;
        }
        for (let i = 0, l = this.layers.length; i < l; i++) {
            this.layers[i]._order = i;
        }
        this.layers.sort(sortLayersByZIndex);
    }

    setSceneConfig(sceneConfig) {
        this.options.sceneConfig = sceneConfig;
        const renderer = this.getRenderer();
        if (renderer) {
            renderer.updateSceneConfig();
        }
        return this;
    }

    getSceneConfig() {
        return JSON.parse(JSON.stringify(this.options.sceneConfig || {}));
    }

    _getSceneConfig() {
        return this.options.sceneConfig;
    }

    getGroundConfig() {
        const sceneConfig = this._getSceneConfig();
        if (!sceneConfig) {
            return null;
        }
        return sceneConfig.ground;
    }

    /**
     * Add a new Layer.
     * @param {Layer} layer - new layer
     * @returns {GroupGLLayer} this
     */
    addLayer(layer, idx) {
        if (layer.getMap()) {
            throw new Error(`layer(${layer.getId()} is already added on map`);
        }
        if (idx === undefined) {
            this.layers.push(layer);
        } else {
            this.layers.splice(idx, 0, layer);
        }
        this._checkChildren();
        this.sortLayersByZIndex();
        const renderer = this.getRenderer();
        if (!renderer) {
            // not loaded yet
            return this;
        }
        this._prepareLayer(layer);
        renderer.setToRedraw();
        return this;
    }

    removeLayer(layer) {
        if (maptalks.Util.isString(layer)) {
            layer = this.getChildLayer(layer);
        }
        const idx = this.layers.indexOf(layer);
        if (idx < 0) {
            return this;
        }
        layer._doRemove();
        layer.off('show hide', this._onLayerShowHide, this);
        delete this._layerMap[layer.getId()];
        this.layers.splice(idx, 1);
        const renderer = this.getRenderer();
        if (!renderer) {
            // not loaded yet
            return this;
        }
        renderer.setToRedraw();
        return this;
    }

    _updatePolygonOffset() {
        let total = 0;
        for (let i = 0; i < this.layers.length; i++) {
            if (this.layers[i].setPolygonOffset && this.layers[i].getPolygonOffsetCount) {
                total += this.layers[i].getPolygonOffsetCount();
            }
        }
        let offset = 0;
        for (let i = 0; i < this.layers.length; i++) {
            if (this.layers[i].setPolygonOffset && this.layers[i].getPolygonOffsetCount) {
                this.layers[i].setPolygonOffset(offset, total);
                offset += this.layers[i].getPolygonOffsetCount();
            }
        }
    }

    /**
     * Get children TileLayer
     * @returns {TileLayer[]}
     */
    getLayers() {
        return this.layers;
    }

    /**
     * Export the GroupTileLayer's profile json. <br>
     * Layer's profile is a snapshot of the layer in JSON format. <br>
     * It can be used to reproduce the instance by [fromJSON]{@link Layer#fromJSON} method
     * @return {Object} layer's profile JSON
     */
    toJSON() {
        const layers = [];
        if (this.layers) {
            for (let i = 0; i < this.layers.length; i++) {
                const layer = this.layers[i];
                if (!layer) {
                    continue;
                }
                if (layer && layer.toJSON) {
                    layers.push(layer.toJSON());
                }
            }
        }
        const profile = {
            'type': this.getJSONType(),
            'id': this.getId(),
            'layers' : layers,
            'options': this.config()
        };
        return profile;
    }

    onLoadEnd() {
        this.layers.forEach(layer => {
            this._prepareLayer(layer);
        });
        super.onLoadEnd();
    }

    _prepareLayer(layer) {
        const map = this.getMap();
        this._layerMap[layer.getId()] = layer;
        layer['_canvas'] = this.getRenderer().canvas;
        layer['_bindMap'](map);
        layer.once('renderercreate', this._onChildRendererCreate, this);
        // layer.on('setstyle updatesymbol', this._onChildLayerStyleChanged, this);
        layer.load();
        this._bindChildListeners(layer);
    }

    onRemove() {
        this.layers.forEach(layer => {
            layer._doRemove();
            layer.off('show hide', this._onLayerShowHide, this);
        });
        delete this._layerMap;
        super.onRemove();
    }

    getChildLayer(id) {
        const layer = this._layerMap[id];
        return layer || null;
    }

    getLayer(id) {
        return this.getChildLayer(id);
    }

    _bindChildListeners(layer) {
        layer.on('show hide', this._onLayerShowHide, this);
    }

    _onLayerShowHide() {
        const renderer = this.getRenderer();
        if (renderer) {
            renderer.setToRedraw();
        }
    }

    _onChildRendererCreate(e) {
        e.renderer.clearCanvas = empty;
    }

    // _onChildLayerStyleChanged() {
    //     const renderer = this.getRenderer();
    //     if (renderer) {
    //         renderer.setTaaOutdated();
    //     }
    // }

    // isVisible() {
    //     if (!super.isVisible()) {
    //         return false;
    //     }
    //     const children = this.layers;
    //     for (let i = 0, l = children.length; i < l; i++) {
    //         if (children[i].isVisible()) {
    //             return true;
    //         }
    //     }
    //     return false;
    // }

    _checkChildren() {
        const ids = {};
        this.layers.forEach(layer => {
            const layerId = layer.getId();
            if (ids[layerId]) {
                throw new Error(`Duplicate child layer id (${layerId}) in the GroupGLLayer (${this.getId()})`);
            } else {
                ids[layerId] = 1;
            }
        });
    }

    addAnalysis(analysis) {
        this._analysisTaskList = this._analysisTaskList || [];
        this._analysisTaskList.push(analysis);
        const renderer = this.getRenderer();
        if (renderer) {
            renderer.setToRedraw();
        }
    }

    removeAnalysis(analysis) {
        if (this._analysisTaskList) {
            const index = this._analysisTaskList.indexOf(analysis);
            if (index > -1) {
                this._analysisTaskList.splice(index, 1);
            }
        }
        const renderer = this.getRenderer();
        if (renderer) {
            renderer.setToRedraw();
        }
    }

    identify(coordinate, options) {
        const map = this.getMap();
        if (!map) {
            return [];
        }
        const containerPoint =  map.coordinateToContainerPoint(new maptalks.Coordinate(coordinate));
        return this.identifyAtPoint(containerPoint, options);
    }

    /**
     * Identify the data at the given point
     * @param {Point} point - container point to identify
     * @param {Object} options - the identify options
     * @param {Number}   [opts.count=1]  - limit of the result count, no limit if 0
     * @param {Number}   [opts.closest=false]  - sort by distance to camera, only support data has identified point
     * @return {Array} result
     **/
    identifyAtPoint(point, options = {}) {
        const childLayers = this.getLayers();
        const layers = (options && options.layers) || childLayers;
        const map = this.getMap();
        if (!map) {
            return [];
        }
        const count = isNil(options.count) ? 1 : options.count;
        let result = [];
        for (let i = 0; i < layers.length; i++) {
            const layer = layers[i];
            if (childLayers.indexOf(layer) < 0 || !layer.identifyAtPoint) {
                continue;
            }
            const picks = layer.identifyAtPoint(point, options);
            if (!picks || picks.length) {
                continue;
            }
            if (options.closest) {
                result.push(...picks.filter(p => !!p.point));
            } else {
                result.push(...picks);
            }
        }
        if (options.closest) {
            const cameraPosition = map.cameraPosition;
            result.sort((a, b) => {
                return vec3.dist(a.picked, cameraPosition) - vec3.dist(b.picked, cameraPosition);
            });
        }
        if (count) {
            result = result.slice(0, count);
        }
        return result;
    }
}

GroupGLLayer.mergeOptions(options);

GroupGLLayer.registerJSONType('GroupGLLayer');

GroupGLLayer.registerRenderer('gl', Renderer);
GroupGLLayer.registerRenderer('canvas', null);

function empty() {}

function sortLayersByZIndex(a, b) {
    const c = a.getZIndex() - b.getZIndex();
    if (c === 0) {
        return a._order - b._order;
    }
    return c;
}

