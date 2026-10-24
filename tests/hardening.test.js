const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { handleInteraction } = require('../services/interactions');
const { start } = require('../index');
const { deploy } = require('../deploy-commands');
const { getWeatherEmbed } = require('../services/weather');

for (const state of ['fresh', 'deferred', 'replied']) {
    test(`failed ${state} error response does not escape interaction handler`, async () => {
        const logs = [];
        let method;
        const interaction = {
            isChatInputCommand: () => true,
            commandName: 'broken',
            client: { commands: new Map([['broken', { execute: async () => { throw new Error('command failed'); } }]]) },
            deferred: state === 'deferred', replied: state === 'replied',
        };
        for (const name of ['reply', 'editReply', 'followUp']) {
            interaction[name] = async () => {
                method = name;
                throw new Error('reply failed');
            };
        }
        await handleInteraction(interaction, { error: (...args) => logs.push(args) });
        assert.equal(method, { fresh: 'reply', deferred: 'editReply', replied: 'followUp' }[state]);
        assert.equal(logs.length, 2);
    });
}

test('missing configuration fails before creating Discord clients', async () => {
    const create = () => { throw new Error('must not create client'); };
    await assert.rejects(start({ DISCORD_TOKEN: ' ' }, create), /Missing required environment variables: DISCORD_TOKEN, OPENWEATHERMAP_API_KEY/);
    await assert.rejects(deploy({ DISCORD_TOKEN: 'secret' }, create), /Missing required environment variables: CLIENT_ID, GUILD_ID/);
});

test('login failure destroys the client and rejects startup', async () => {
    let destroyed = false;
    const client = {
        once: () => undefined,
        on: () => undefined,
        login: async () => { throw new Error('login failed'); },
        destroy: async () => { destroyed = true; },
    };
    await assert.rejects(start({ DISCORD_TOKEN: 'dummy', OPENWEATHERMAP_API_KEY: 'dummy' }, () => client), /login failed/);
    assert.equal(destroyed, true);
});

test('entry points exit unsuccessfully with safe diagnostics', () => {
    const cwd = path.resolve(__dirname, '..');
    const env = { ...process.env, DISCORD_TOKEN: '', OPENWEATHERMAP_API_KEY: '', CLIENT_ID: '', GUILD_ID: '' };
    for (const file of ['index.js', 'deploy-commands.js']) {
        const result = spawnSync(process.execPath, [file], { cwd, env, encoding: 'utf8' });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Missing required environment variables: DISCORD_TOKEN/);
    }
    const directory = mkdtempSync(path.join(tmpdir(), 'kirinobot-test-'));
    try {
        const preload = path.join(directory, 'preload.cjs');
        const discordPath = require.resolve('discord.js');
        writeFileSync(preload, `const discord = require(${JSON.stringify(discordPath)}); discord.REST.prototype.put = async () => { throw new Error('sensitive-diagnostic'); }; discord.Client.prototype.login = async () => { throw new Error('sensitive-diagnostic'); };`);
        for (const file of ['index.js', 'deploy-commands.js']) {
            const result = spawnSync(process.execPath, ['--require', preload, file], {
                cwd, encoding: 'utf8', env: { ...env, DISCORD_TOKEN: 'secret-token', OPENWEATHERMAP_API_KEY: 'secret-key', CLIENT_ID: '123', GUILD_ID: '456' },
            });
            assert.equal(result.status, 1);
            assert.match(result.stderr, /failed/);
            assert.doesNotMatch(result.stderr, /secret-token|secret-key|sensitive-diagnostic/);
        }
    }
    finally { rmSync(directory, { recursive: true, force: true }); }
});

const location = { name: 'Town '.repeat(100), country: 'NL', lat: 52, lon: 5 };
const alert = { event: 'Storm '.repeat(100), start: 1, end: 2, description: 'Heavy rain. '.repeat(200) };
function checkLimits(embed) {
    const json = embed.toJSON();
    assert.ok(json.title.length <= 256);
    assert.ok(json.fields.length <= 25);
    let length = json.title.length + (json.footer?.text.length || 0);
    for (const field of json.fields) {
        assert.ok(field.name.length > 0 && field.name.length <= 256);
        assert.ok(field.value.length > 0 && field.value.length <= 1024);
        length += field.name.length + field.value.length;
    }
    assert.ok(length <= 6000);
    return json;
}

test('oversized alerts respect individual and aggregate limits and report omissions', () => {
    const json = checkLimits(getWeatherEmbed(location, { current: {}, alerts: Array(40).fill(alert) }, null, null, null, 'alerts'));
    assert.match(json.footer.text, /additional alerts omitted/);
    assert.equal(Number(json.footer.text.split(' ')[0]) + json.fields.length, 40);
});

test('many short alerts respect the 25-field cap', () => {
    const json = checkLimits(getWeatherEmbed(location, { current: {}, alerts: Array(40).fill({ ...alert, event: 'Storm', description: 'Rain' }) }, null, null, null, 'alerts'));
    assert.equal(json.fields.length, 25);
    assert.match(json.footer.text, /15 additional alerts omitted/);
});

test('normal weather summarizes omitted alerts inside its single alert field', () => {
    const current = { dt: 1, weather: [{ description: 'Sunny', icon: '01d' }], temp: 10, feels_like: 10, pressure: 1000, wind_speed: 1, wind_deg: 1, visibility: 10000 };
    const json = checkLimits(getWeatherEmbed(location, { current, timezone_offset: 0, alerts: Array(40).fill(alert) }));
    assert.match(json.fields.find(field => field.name === 'Weather Alerts').value, /39 additional alerts omitted/);
});
