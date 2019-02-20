const path = require('path');

const data = {
    type : 'FeatureCollection',
    features : [
        { type : 'Feature', geometry : { type : 'Point', coordinates : [0.5, 0.5] }, properties : { type : 1 }}
    ]
};

const style = [
    {
        type: 'icon',
        dataConfig: {
            type: 'point'
        },
        sceneConfig: {
            collision: false,
            fading : false
        },
        style: [
            {
                symbol: {
                    markerFile: 'file://' + path.resolve(__dirname, '../../../resources/plane-min.png'),
                    markerWidth: 30,
                    markerHeight: 30,
                    markerOpacity: 1,
                    markerRotation : 90
                }
            }
        ]
    }
];

module.exports = {
    style,
    data,
    view : {
        center : [0, 0],
        zoom : 6
    }
};
