const data = {
    type: 'FeatureCollection',
    features: [
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[91.14278,29.658272], [91.15078,29.658272]] }, properties: { type: 1 } }
    ]
};

const style = [
    {
        filter: true,
        renderPlugin: {
            type: 'line',
            dataConfig: {
                type: 'line'
            }
        },
        symbol: {
            lineWidth: 6,
            lineColor: '#f00',
            lineOpacity: 1
        }
    }
];

module.exports = {
    style,
    data
};
