#define RAD 0.0174532925

attribute vec3 aPosition;
attribute vec2 aShape;
attribute vec2 aSize;
attribute vec2 aTexCoord;
attribute float aRotation;
attribute vec2 aDxDy;
//uint8
#ifdef ENABLE_COLLISION
attribute float aOpacity;
#endif

uniform float cameraToCenterDistance;
uniform mat4 projViewModelMatrix;
uniform float markerPerspectiveRatio;

//TODO markerRotation

uniform vec2 iconSize;
uniform vec2 texSize;
uniform vec2 canvasSize;
uniform float pitchWithMap;
uniform float mapPitch;
uniform float rotateWithMap;
uniform float mapRotation;

uniform float zoomScale;
uniform float tileRatio; //EXTENT / tileSize

varying vec2 vTexCoord;
varying float vOpacity;

void main() {
    gl_Position = projViewModelMatrix * vec4(aPosition, 1.0);
    float distance = gl_Position.w;

    float distanceRatio = (1.0 - cameraToCenterDistance / distance) * markerPerspectiveRatio;
    //通过distance动态调整大小
    float perspectiveRatio = clamp(
        0.5 + 0.5 * (1.0 - distanceRatio),
        0.0, // Prevents oversized near-field symbols in pitched/overzoomed tiles
        4.0);

    float rotation = aRotation * RAD - mapRotation * rotateWithMap;
    if (pitchWithMap == 1.0) {
        rotation += mapRotation;
    }
    float angleSin = sin(rotation);
    float angleCos = cos(rotation);

    mat2 shapeMatrix = mat2(angleCos, -1.0 * angleSin, angleSin, angleCos);
    vec2 shape = shapeMatrix * aShape;
    shape = shape / iconSize * aSize;

    if (pitchWithMap == 0.0) {
        vec2 offset = shape * 2.0 / canvasSize;
        gl_Position.xy += offset * perspectiveRatio * distance;
    } else {
        float cameraScale = distance / cameraToCenterDistance;
        vec2 offset = shape * vec2(1.0, -1.0);
        //乘以cameraScale可以抵消相机近大远小的透视效果
        gl_Position = projViewModelMatrix * vec4(aPosition + vec3(offset, 0.0) * tileRatio / zoomScale * cameraScale * perspectiveRatio, 1.0);
    }

    gl_Position.xy += aDxDy * 2.0 / canvasSize;

    vTexCoord = aTexCoord / texSize;

    #ifdef ENABLE_COLLISION
    vOpacity = aOpacity / 255.0;
    #else
    vOpacity = 1.0;
    #endif
}
