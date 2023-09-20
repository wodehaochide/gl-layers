import * as GLTFHelper  from '../GLTFHelper.js';
import { simpleModels, getSimpleModel } from './SimpleModel';
import { defined } from '../common/Util';

export default class GLTFManager {
    constructor(regl) {
        this.regl = regl;
        this.resourceMap = {};
    }

    getGLTF(url) {
        return this.resourceMap[url];
    }

    loginGLTF(url, requestor) {
        if (!this.resourceMap[url]) {
            if (simpleModels[url]) { //简单模型不需要request，直接返回数据
                const data = getSimpleModel(url);
                this.resourceMap[url] = this._exportGLTFResource(data, url, false);
            } else if (requestor) {
                this.resourceMap[url] = requestor(url).then(gltf => {
                    const gltfpack = this._exportGLTFResource(gltf, url);
                    this.resourceMap[url] = gltfpack;
                    return gltfpack;
                });
            } else {
                this.resourceMap[url] = this._loadGLTFModel(url).catch(e => {
                    return e;
                });
            }
            this.resourceMap[url].refCount = 1;
        } else {
            this.resourceMap[url].refCount += 1;
        }
    }

    logoutGLTF(url) {
        if (this.resourceMap[url]) {
            this.resourceMap[url].refCount -= 1;
            if (this.resourceMap[url].refCount < 1) {
                const resources = this.resourceMap[url].resources;
                if (resources) {
                    for (let i = 0; i < resources.length; i++) {
                        resources[i].geometry.dispose();
                        if (resources[i].copyGeometry) {
                            resources[i].copyGeometry.dispose();
                        }
                        if (resources[i].material) {
                            resources[i].material.dispose();
                        }
                    }
                }
                if (this.resourceMap[url].gltfPack) {
                    this.resourceMap[url].gltfPack.dispose();
                }
                delete this.resourceMap[url];
            }
        }
    }

    isSimpleModel(url) {
        return simpleModels[url];
    }

    _exportGLTFResource(gltf, url, useUniqueREGLBuffer = true) {
        const gltfPack = GLTFHelper.exportGLTFPack(gltf, useUniqueREGLBuffer ? this.regl : null);
        const geometries = gltfPack.getMeshesInfo();
        const resourceMap = {
            gltfPack,
            resources: geometries,
            //目前只用到gltf原始数据中的assets和animations,为避免占用内存，只保存需要用到的信息
            json: { asset: gltf.asset, animations: gltf.animations ? gltf.animations.map((animation, index) => { return { name: defined(animation.name) ? animation.name : index }; }) : null },
            refCount: this.resourceMap[url] ? this.resourceMap[url].refCount : 0 //这里不能设置为0，由于是异步，会把前面累增的量重置为0
        };
        return resourceMap;
    }

    _loadData(url) {
        return GLTFHelper.load(url).then(gltfData => {
            return gltfData;
        });
    }

    _loadGLTFModel(url) {
        return this._loadData(url).then(data => {
            this.resourceMap[url] = this._exportGLTFResource(data, url);
            return this.resourceMap[url];
        });
    }
}
