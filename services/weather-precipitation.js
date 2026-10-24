function precipitationAmount(hour) {
    let total = 0;
    let supplied = false;
    for (const type of ['rain', 'snow']) {
        if (hour[type] === undefined) continue;
        const value = hour[type]?.['1h'];
        if (!Number.isFinite(value) || value < 0) return NaN;
        supplied = true;
        total += value;
    }
    return supplied && Number.isFinite(total) ? total : NaN;
}

function formatAmount(value) {
    if (!Number.isFinite(value) || value < 0) return '—';
    if (value > 0 && value < 0.01) return '<0.01';
    if (value >= 1000) return value.toExponential(1);
    return String(Number(value.toFixed(value < 1 ? 2 : 1)));
}

module.exports = { precipitationAmount, formatAmount };
