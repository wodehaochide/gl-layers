import * as GLTFHelper  from '../GLTFHelper.js';

export default class GLTFManager {
    constructor(regl) {
        this.regl = regl;
        this.resourceMap = {};
    }

    getGLTF(url) {
        return this.resourceMap[url];
    }

    loginGLTF(url, gltf) {
        if (!this.resourceMap[url]) {
            //传入载入好的gltf数据不需要再载入
            this.resourceMap[url] = gltf ? this._exportGLTFResource(gltf) : this._loadGLTFModel(url).catch(e => {
                return e;
            });
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

    _exportGLTFResource(gltf) {
        const gltfPack = GLTFHelper.exportGLTFPack(gltf, this.regl);
        const geometries = gltfPack.getMeshesInfo();
        const resourceMap = {
            gltfPack,
            resources: geometries,
            json: gltf,
            refCount: 0
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
            this.resourceMap[url] = this._exportGLTFResource(data);
            return this.resourceMap[url];
        });
    }
}
