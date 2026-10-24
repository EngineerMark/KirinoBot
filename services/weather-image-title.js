const { countryFlag } = require('./weather-country-flag');

// Explicit text lengths keep the inline SVG flag anchored to the rendered text.
function textWidth(text) {
    return Array.from(text).reduce((width, char) => {
        if (char === ' ') return width + 10;
        if (/[ilI.,:;'!|]/.test(char)) return width + 10;
        if (/[mwMW@]/.test(char)) return width + 28;
        if (/[A-Z]/.test(char)) return width + 23;
        if (char.codePointAt(0) > 255) return width + 30;
        return width + 19;
    }, 0);
}

function drawImageTitle(title, location, { plainText, escapeXml }) {
    const text = plainText(title).replace(/\uE000/g, '');
    const name = plainText(location?.name).replace(/\uE000/g, '');
    const nameEnd = name ? text.lastIndexOf(name) + name.length : -1;
    const hasFlag = Boolean(countryFlag(location?.country)) && name && text.includes(name);
    const marked = hasFlag ? text.slice(0, nameEnd) + ' \uE000 ' + text.slice(nameEnd) : text;
    const lines = [[]];
    const width = tokens => tokens.reduce((sum, token, index) => sum + (index ? 10 : 0) + (token === '\uE000' ? 36 : textWidth(token)), 0);
    for (const word of marked.split(/\s+/).filter(Boolean)) {
        // Bound long unbroken place names while allowing ordinary names to wrap.
        const parts = word === '\uE000' ? [word] : word.match(/.{1,22}/gu) || [];
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
        while (last.length && width([...last, '...']) > 656) last.pop();
        last.push('...');
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
                svg += `<text x="${x}" y="${y}" font-size="30" fill="#f5f8ff" font-weight="700" textLength="${length}" lengthAdjust="spacingAndGlyphs">${escapeXml(token)}</text>`;
                x += length + 10;
            }
        });
    });
    return { svg, lines: shown.length, overflow: lines.length > 2 };
}

module.exports = { drawImageTitle };
