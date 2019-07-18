import { vec2, vec3 } from '@maptalks/gl';
import { clamp } from '../../Util';
import { getPitchPosition, getPosition, getShapeMatrix } from './box_util';
import { GLYPH_SIZE } from '../Constant';

//temparary variables
const MAT2 = [];
const V2_0 = [], V2_1 = [], V2_2 = [], V2_3 = [];

const DXDY = [];

const AXIS_FACTOR = [1, -1];

export function getLabelBox(out, anchor, projAnchor, mesh, textSize, i, matrix, map) {
    const uniforms = mesh.material.uniforms;
    const cameraToCenterDistance = map.cameraToCenterDistance;
    const geoProps = mesh.geometry.properties;
    const symbol = geoProps.symbol;
    const isAlongLine = (symbol['textPlacement'] === 'line' && !symbol['isIconText']);

    const glyphSize = GLYPH_SIZE;

    const cameraDistance = projAnchor[2];

    let perspectiveRatio = 1;
    if (uniforms['textPerspectiveRatio']) {
        const distanceRatio = (1.0 - cameraToCenterDistance / cameraDistance) * uniforms['textPerspectiveRatio'];
        //通过distance动态调整大小
        perspectiveRatio = clamp(
            0.5 + 0.5 * (1.0 - distanceRatio),
            0.0, // Prevents oversized near-field symbols in pitched/overzoomed tiles
            4.0);
    }

    const { aTextDx, aTextDy } = mesh.geometry.properties;
    const textDx = aTextDx ? aTextDx[i] : symbol['textDx'];
    const textDy = aTextDy ? aTextDy[i] : symbol['textDy'];
    const dxdy = vec2.set(DXDY, textDx || 0, textDy || 0);

    if (!isAlongLine) {
        const { aShape } = geoProps;
        let tl = vec2.set(V2_0, aShape[i * 2] / 10, aShape[i * 2 + 1] / 10),
            tr = vec2.set(V2_1, aShape[i * 2 + 2] / 10, aShape[i * 2 + 3] / 10),
            bl = vec2.set(V2_2, aShape[i * 2 + 4] / 10, aShape[i * 2 + 5] / 10),
            br = vec2.set(V2_3, aShape[i * 2 + 6] / 10, aShape[i * 2 + 7] / 10);

        const textScale = textSize / glyphSize;
        vec2.scale(tl, tl, textScale);
        vec2.scale(tr, tr, textScale);
        vec2.scale(bl, bl, textScale);
        vec2.scale(br, br, textScale);

        let textRotation = symbol['textRotation'] || 0;
        const mapRotation = !isAlongLine ? map.getBearing() * Math.PI / 180 : 0;
        if (textRotation || mapRotation) {
            const shapeMatrix = getShapeMatrix(MAT2, textRotation, mapRotation, uniforms['rotateWithMap'], uniforms['pitchWithMap']);
            tl = vec2.transformMat2(tl, tl, shapeMatrix);
            tr = vec2.transformMat2(tr, tr, shapeMatrix);
            bl = vec2.transformMat2(bl, bl, shapeMatrix);
            br = vec2.transformMat2(br, br, shapeMatrix);
        }

        //1. 获得shape的tl, tr, bl, 和br
        //2. 计算旋转矩阵: shapeMatrix
        //3. 计算最终的shape
        //   3.1 如果没有pitchWithMap，值是 shapeMatrix * shape
        //   3.2 如果pitchWidthMap， 值是aAnchor和shape相加后，projectPoint后的计算结果
        //4. 将最终计算结果与dxdy相加

        vec2.multiply(tl, tl, AXIS_FACTOR);
        vec2.multiply(tr, tr, AXIS_FACTOR);
        vec2.multiply(bl, bl, AXIS_FACTOR);
        vec2.multiply(br, br, AXIS_FACTOR);

        if (uniforms['pitchWithMap'] === 1) {
            getPitchPosition(out, anchor, tl, tr, bl, br, matrix, dxdy, uniforms, map, cameraDistance, perspectiveRatio);
        } else {
            getPosition(out, projAnchor, tl, tr, bl, br, dxdy, perspectiveRatio);
        }

    } else {
        //2. offset中已经包含了shape的值
        //3. 获得offset
        //4. 计算最终的offset
        //   4.1 如果没有pitchWithMap
        //   4.2 如果pitchWidthMap，和pos相加后，projectPoint后的计算结果
        //5. 将最终计算结果与dxdy相加

        const { aOffset } = geoProps;
        //除以10是因为赋值时, aOffset有精度修正
        let tl = vec2.set(V2_0, aOffset[i * 2] / 10, aOffset[i * 2 + 1] / 10),
            tr = vec2.set(V2_1, aOffset[i * 2 + 2] / 10, aOffset[i * 2 + 3] / 10),
            bl = vec2.set(V2_2, aOffset[i * 2 + 4] / 10, aOffset[i * 2 + 5] / 10),
            br = vec2.set(V2_3, aOffset[i * 2 + 6] / 10, aOffset[i * 2 + 7] / 10);
        if (uniforms['pitchWithMap'] === 1) {
            getPitchPosition(out, anchor, tl, tr, bl, br, matrix, dxdy, uniforms, map, cameraDistance, perspectiveRatio);
        } else {
            vec2.multiply(tl, tl, AXIS_FACTOR);
            vec2.multiply(tr, tr, AXIS_FACTOR);
            vec2.multiply(bl, bl, AXIS_FACTOR);
            vec2.multiply(br, br, AXIS_FACTOR);
            getPosition(out, projAnchor, tl, tr, bl, br, dxdy, perspectiveRatio);
        }
    }
    return out;
}

export function getAnchor(out, mesh, i) {
    const positionSize = mesh.geometry.desc.positionSize;
    const aAnchor = mesh.geometry.properties.aAnchor;
    return vec3.set(out, aAnchor[i * positionSize], aAnchor[i * positionSize + 1], positionSize === 2 ? 0 : aAnchor[i * positionSize + 2]);
}
