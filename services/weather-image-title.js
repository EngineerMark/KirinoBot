const { countryFlag } = require('./weather-country-flag');
const { measureText, wrapText } = require('./weather-image-layout');

// Use the bundled font's advances so the inline flag follows the actual text.
function textWidth(text) {
    return measureText(text, 30, true);
}

function drawImageTitle(title, location, { plainText, escapeXml }) {
    const text = plainText(title).replace(/\uE000/g, '').replace(/ at Unavailable$/, '');
    const name = plainText(location?.name).replace(/\uE000/g, '');
    const nameEnd = name ? text.lastIndexOf(name) + name.length : -1;
    const hasFlag = Boolean(countryFlag(location?.country)) && name && text.includes(name);
    const marked = hasFlag ? text.slice(0, nameEnd) + ' \uE000 ' + text.slice(nameEnd) : text;
    const lines = [[]];
    const width = tokens => tokens.reduce((sum, token, index) => sum + (index ? 10 : 0) + (token === '\uE000' ? 36 : textWidth(token)), 0);
    for (const word of marked.split(/\s+/).filter(Boolean)) {
        // Bound long unbroken place names while allowing ordinary names to wrap.
        const parts = word === '\uE000' ? [word] : wrapText(word, 600, 30, true);
        for (const part of parts) {
            let line = lines[lines.length - 1];
            if (line.length && width([...line, part]) > 656) {
                // Keep the last location word and its flag together at a line break.
                const carry = part === '\uE000' ? line.pop() : null;
                line = carry ? [carry] : [];
                lines.push(line);
            }
            line.push(part);
        }
    }
    const shown = lines.slice(0, 2);
    if (lines.length > 2) {
        const last = shown[1];
        const suffix = hasFlag && !shown.flat().includes('\uE000') ? ['...', '\uE000'] : ['...'];
        while (last.length && width([...last, ...suffix]) > 656) {
            const final = Array.from(last[last.length - 1]);
            if (final.length > 1 && last[last.length - 1] !== '\uE000') last[last.length - 1] = final.slice(0, -1).join('');
            else last.pop();
        }
        last.push(...suffix);
    }
    let svg = '';
    shown.forEach((line, index) => {
        let x = 32;
        const y = 82 + index * 38;
        line.forEach(token => {
            if (token === '\uE000') {
                svg += countryFlag(location.country, x, y - 24);
                x += 46;
            }
            else {
                const length = textWidth(token);
                svg += `<text x="${x}" y="${y}" font-size="30" fill="#f5f8ff" font-weight="700">${escapeXml(token)}</text>`;
                x += length + 10;
            }
        });
    });
    return { svg, lines: shown.length, overflow: lines.length > 2 };
}

module.exports = { drawImageTitle };
