#include <gl2_vert>
#define SHADER_NAME PBR
precision highp float;

attribute vec3 aPosition;

#if defined(HAS_MAP)
    attribute vec2 aTexCoord;
    uniform vec2 uvOrigin;
    uniform vec2 uvScale;
    uniform vec2 uvOffset;
    uniform float uvRotation;
#endif
#if defined(HAS_TANGENT)
    attribute vec4 aTangent;
#else
    attribute vec3 aNormal;
#endif

vec3 Vertex;
vec3 Normal;
vec4 Tangent;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 positionMatrix;
uniform mat4 projMatrix;

uniform vec2 outSize;
uniform vec2 halton;
uniform mediump vec3 cameraPosition;

uniform mat3 modelNormalMatrix;

#ifdef HAS_SSR
    uniform mat3 modelViewNormalMatrix;
    varying vec3 vViewNormal;
    #ifdef HAS_TANGENT
        varying vec4 vViewTangent;
    #endif
#endif
varying vec3 vModelNormal;
varying vec4 vViewVertex;

#if defined(HAS_TANGENT)
    varying vec4 vModelTangent;
    varying vec3 vModelBiTangent;
#endif

varying vec3 vModelVertex;
#if defined(HAS_MAP)
    varying vec2 vTexCoord;
#endif

#if defined(HAS_COLOR)
    attribute vec4 aColor;
    varying vec4 vColor;
#endif

#if defined(HAS_COLOR0)
    #if COLOR0_SIZE == 3
        attribute vec3 aColor0;
        varying vec3 vColor0;
    #else
        attribute vec4 aColor0;
        varying vec4 vColor0;
    #endif
#endif

#include <line_extrusion_vert>
#include <get_output>
#include <viewshed_vert>
#include <flood_vert>
#if defined(HAS_SHADOWING) && !defined(HAS_BLOOM)
    #include <vsm_shadow_vert>
#endif
#include <heatmap_render_vert>
#include <fog_render_vert>

#if defined(HAS_BUMP_MAP) && defined(HAS_TANGENT)
    varying vec3 vTangentViewPos;
    varying vec3 vTangentFragPos;
    #if __VERSION__ == 100
        mat3 transposeMat3(in mat3 inMat) {
            vec3 i0 = inMat[0];
            vec3 i1 = inMat[1];
            vec3 i2 = inMat[2];

            return mat3(
                vec3(i0.x, i1.x, i2.x),
                vec3(i0.y, i1.y, i2.y),
                vec3(i0.z, i1.z, i2.z)
            );
        }
    #else
        mat3 transposeMat3(in mat3 inMat) {
            return transpose(inMat);
        }
    #endif
#endif

/**
 * Extracts the normal vector of the tangent frame encoded in the specified quaternion.
 */
void toTangentFrame(const highp vec4 q, out highp vec3 n) {
    n = vec3( 0.0,  0.0,  1.0) +
        vec3( 2.0, -2.0, -2.0) * q.x * q.zwx +
        vec3( 2.0,  2.0, -2.0) * q.y * q.wzy;
}

/**
 * Extracts the normal and tangent vectors of the tangent frame encoded in the
 * specified quaternion.
 */
void toTangentFrame(const highp vec4 q, out highp vec3 n, out highp vec3 t) {
    toTangentFrame(q, n);
    t = vec3( 1.0,  0.0,  0.0) +
        vec3(-2.0,  2.0, -2.0) * q.y * q.yxw +
        vec3(-2.0,  2.0,  2.0) * q.z * q.zwx;
}

const float mid = 0.5;
//https://gist.github.com/ayamflow/c06bc0c8a64f985dd431bd0ac5b557cd
vec2 rotateUV(vec2 uv, float rotation) {
    return vec2(
        cos(rotation) * (uv.x - mid) + sin(rotation) * (uv.y - mid) + mid,
        cos(rotation) * (uv.y - mid) - sin(rotation) * (uv.x - mid) + mid
    );
}

void main() {
    #if defined(HAS_MAP)
        #ifdef HAS_RANDOM_TEX
            vec2 origin = uvOrigin;
            vec2 texCoord = aTexCoord * uvScale + uvOffset;
            if (uvRotation != 0.0) {
                origin = rotateUV(origin, uvRotation);
                texCoord = rotateUV(texCoord, uvRotation);
            }
            vTexCoord = mod(origin, 1.0) + texCoord;
        #else
            vec2 origin = uvOrigin;
            vec2 texCoord = aTexCoord * uvScale;
            if (uvRotation != 0.0) {
                origin = rotateUV(origin, uvRotation);
                texCoord = rotateUV(texCoord, uvRotation);
            }
            vTexCoord = mod(origin, 1.0) + texCoord + uvOffset;
        #endif

    #endif

    #if defined(HAS_TANGENT)
        vec3 t;
        toTangentFrame(aTangent, Normal, t);
        // Tangent = vec4(t, aTangent.w);
        // vec4 localTangent = Tangent;
        // vViewTangent = vec4(modelViewNormalMatrix * localTangent.xyz, localTangent.w);
        vModelTangent = vec4(modelNormalMatrix * t, aTangent.w);
    #else
        Normal = aNormal;
    #endif

    mat4 localPositionMatrix = getPositionMatrix();
    #ifdef IS_LINE_EXTRUSION
        vec3 linePosition = getLineExtrudePosition(aPosition);
        //linePixelScale = tileRatio * resolution / tileResolution
        vec4 localVertex = getPosition(linePosition);
    #else
        vec4 localVertex = getPosition(aPosition);
    #endif
    vModelVertex = (modelMatrix * localVertex).xyz;

    vec3 localNormal = Normal;
    vModelNormal = modelNormalMatrix * localNormal;

    #if defined(HAS_TANGENT)
        vModelBiTangent = cross(vModelNormal, vModelTangent.xyz) * sign(aTangent.w);
    #endif

    #ifdef HAS_SSR
        vViewNormal = modelViewNormalMatrix * Normal;
         #if defined(HAS_TANGENT)
            // Tangent = vec4(t, aTangent.w);
            vec4 localTangent = vec4(t, aTangent.w);;
            vViewTangent = vec4(modelViewNormalMatrix * localTangent.xyz, localTangent.w);
        #endif
    #endif

    vec4 position = localPositionMatrix * localVertex;
    vec4 viewVertex = modelViewMatrix * position;
    vViewVertex = viewVertex;
    // gl_Position = projMatrix * modelViewMatrix * localVertex;
    mat4 jitteredProjection = projMatrix;
    jitteredProjection[2].xy += halton.xy / outSize.xy;
    gl_Position = jitteredProjection * viewVertex;
    // gl_PointSize = min(64.0, max(1.0, -uPointSize / vViewVertex.z));

    #if defined(HAS_COLOR)
        vColor = aColor / 255.0;
    #endif

    #if defined(HAS_COLOR0)
        vColor0 = aColor0 / 255.0;
    #endif

    #if defined(HAS_SHADOWING) && !defined(HAS_BLOOM)
        shadow_computeShadowPars(position);
    #endif

    #ifdef HAS_VIEWSHED
        viewshed_getPositionFromViewpoint(modelMatrix * position);
    #endif

    #ifdef HAS_FLOODANALYSE
        flood_getHeight(modelMatrix * position);
    #endif

    #ifdef HAS_HEATMAP
        heatmap_compute(projMatrix * modelViewMatrix * localPositionMatrix,localVertex);
    #endif

    #ifdef HAS_FOG
        fog_getDist( modelMatrix * position);
    #endif

    #if defined(HAS_BUMP_MAP) && defined(HAS_TANGENT)
        mat3 TBN = transposeMat3(mat3(vModelTangent.xyz, vModelBiTangent, vModelNormal));
        vTangentViewPos = TBN * cameraPosition;
        vTangentFragPos = TBN * vModelVertex;
    #endif
}
