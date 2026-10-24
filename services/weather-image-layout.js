const fontkit = require('fontkit');
const sharp = require('sharp');

const files = {
    regular: require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'),
    bold: require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf'),
};
const fonts = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fontkit.openSync(file)]));

function measureText(text, size = 18, bold = false) {
    const font = bold ? fonts.bold : fonts.regular;
    const string = String(text);
    const width = font.layout(string).positions.reduce((sum, position) => sum + position.xAdvance, 0) * size / font.unitsPerEm;
    // Leave room for full-width fallback glyphs for scripts outside the bundled face.
    const missing = Array.from(string).filter(char => !font.hasGlyphForCodePoint(char.codePointAt(0))).length;
    const fallbackWidth = font.getGlyph(0).advanceWidth * size / font.unitsPerEm;
    return width + missing * Math.max(0, size - fallbackWidth);
}

function wrapText(text, maxWidth, size = 18, bold = false) {
    const lines = [];
    for (const paragraph of String(text).split('\n')) {
        let line = '';
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            if (line && measureText(`${line} ${word}`, size, bold) <= maxWidth) {
                line += ` ${word}`;
                continue;
            }
            if (line) lines.push(line);
            line = '';
            for (const char of word) {
                if (line && measureText(line + char, size, bold) > maxWidth) {
                    lines.push(line);
                    line = '';
                }
                line += char;
            }
        }
        if (line) lines.push(line);
    }
    return lines;
}

let ready;
function ensureFonts() {
    // Register both local faces with the same native font engine used by SVG rendering.
    ready ||= (async () => {
        for (const [key, fontfile] of Object.entries(files)) {
            await sharp({ text: { text: 'A', font: `DejaVu Sans ${key === 'bold' ? 'Bold ' : ''}18`, fontfile, dpi: 72 } }).png().toBuffer();
        }
    })().catch(error => { ready = undefined; throw error; });
    return ready;
}

function temperatureScale(values) {
    if (!values.length) return { minimum: 0, maximum: 10, ticks: [0, 2.5, 5, 7.5, 10] };
    const low = Math.min(...values);
    const high = Math.max(...values);
    const target = Math.max(1, (high - low) / 4);
    const magnitude = 10 ** Math.floor(Math.log10(target));
    const step = [1, 2, 2.5, 5, 10].map(value => value * magnitude).find(value => value >= target);
    let minimum = Math.floor(low / step) * step;
    let maximum = Math.ceil(high / step) * step;
    if (minimum === maximum) {
        minimum -= step;
        maximum += step;
    }
    const ticks = [];
    for (let value = minimum; value <= maximum + step / 100; value += step) ticks.push(Number(value.toFixed(2)));
    return { minimum, maximum, ticks };
}

module.exports = { measureText, wrapText, ensureFonts, temperatureScale };
