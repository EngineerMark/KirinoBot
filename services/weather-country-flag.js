const { readFileSync } = require('node:fs');
const path = require('node:path');

const flagRoot = path.join(path.dirname(require.resolve('flag-icons/package.json')), 'flags', '4x3');
const flags = new Map();

function countryFlag(country, x = 32, y = 58) {
    if (typeof country !== 'string' || !/^[a-z]{2}$/i.test(country)) return '';
    const code = country.toLowerCase();
    if (!flags.has(code)) {
        try {
            flags.set(code, readFileSync(path.join(flagRoot, `${code}.svg`)).toString('base64'));
        }
        catch (error) {
            if (error.code !== 'ENOENT') throw error;
            flags.set(code, null);
        }
    }
    const asset = flags.get(code);
    if (!asset) return '';
    return `<image x="${x}" y="${y}" width="36" height="27" href="data:image/svg+xml;base64,${asset}"/><rect x="${x}" y="${y}" width="36" height="27" fill="none" stroke="#a9bad1" stroke-opacity="0.35" rx="1"/>`;
}

module.exports = { countryFlag };
