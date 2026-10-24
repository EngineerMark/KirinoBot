function validateEnvironment(env, deployment = false) {
    const required = deployment ? ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID'] : ['DISCORD_TOKEN', 'OPENWEATHERMAP_API_KEY'];
    const missing = required.filter(name => typeof env[name] !== 'string' || !env[name].trim());
    if (missing.length) throw new Error('Missing required environment variables: ' + missing.join(', '));
}

module.exports = { validateEnvironment };
