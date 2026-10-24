const { EmbedBuilder } = require('discord.js');

function truncate(value, limit) {
    const text = String(value ?? '').trim() || 'N/A';
    if (text.length <= limit) return text;
    // Avoid splitting a UTF-16 surrogate pair at the truncation boundary.
    let prefix = text.slice(0, limit - 3);
    if (/[\uD800-\uDBFF]$/.test(prefix)) prefix = prefix.slice(0, -1);
    return prefix + '...';
}

class WeatherEmbedBuilder extends EmbedBuilder {
    setTitle(title) {
        return super.setTitle(truncate(title, 256));
    }

    addFields(...fields) {
        let omitted = 0;
        for (const field of fields.flat()) {
            const name = truncate(field.name, 256);
            const value = truncate(field.value, 1024);
            // Reserve room for an omission notice and respect the total embed limit.
            const length = (this.data.title?.length || 0) + (this.data.description?.length || 0)
                + (this.data.fields || []).reduce((sum, item) => sum + item.name.length + item.value.length, 0);
            if ((this.data.fields?.length || 0) >= 25 || length + name.length + value.length > 5900) {
                omitted++;
                continue;
            }
            super.addFields({ ...field, name, value });
        }
        if (omitted) {
            this.omittedFields = (this.omittedFields || 0) + omitted;
            this.setFooter({ text: `${this.omittedFields} additional alerts omitted due to message limits.` });
        }
        return this;
    }
}

module.exports = { WeatherEmbedBuilder, truncate };
