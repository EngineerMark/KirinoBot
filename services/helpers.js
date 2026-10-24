function formatNumber(num, decimals = 2) {
    // point is to convert for example 1.2442 to 1.24..
    return Number.isFinite(num) ? num.toFixed(decimals) : 'Unavailable';
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

function rad2deg(rad) {
    return rad * (180 / Math.PI);
}

module.exports = {
    formatNumber,
    deg2rad,
    rad2deg,
};