// Validate before database connection/listening. Errors name settings, never
// include their values. Length/placeholder checks cannot prove random entropy.
function requireKey(env, name) {
    const value = env[name];
    if (typeof value !== 'string' || value !== value.trim()
        || Buffer.byteLength(value, 'utf8') < 32 || new Set(value).size < 2
        || /^(your[_ -]|replace[_ -]|change[_ -]?me|use_a_long)/i.test(value)) {
        throw new Error(`${name} must be an independently generated random secret of at least 32 bytes, not a placeholder`);
    }
}

export function validateProductionSecurity(env = process.env) {
    const environment = env.NODE_ENV || 'production';
    if (!['production', 'development', 'test'].includes(environment)) {
        throw new Error('NODE_ENV must be development, test or production');
    }
    if (environment !== 'production') return;
    requireKey(env, 'JWT_SECRET');
    if (!env.MONGO_URI || !/^mongodb(?:\+srv)?:\/\/\S+$/.test(env.MONGO_URI)) {
        throw new Error('MONGO_URI must be a MongoDB connection URI');
    }
    const oauthKeys = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_CALLBACK_URL'];
    const githubEnabled = oauthKeys.some((key) => Boolean(env[key]));
    if (githubEnabled) {
        for (const key of oauthKeys) {
            if (!env[key]?.trim()) throw new Error(`${key} is required when GitHub OAuth is configured`);
        }
    }
    if (githubEnabled || env.GITHUB_TOKEN_ENCRYPTION_KEY) {
        requireKey(env, 'GITHUB_TOKEN_ENCRYPTION_KEY');
        if (env.GITHUB_TOKEN_ENCRYPTION_KEY === env.JWT_SECRET) {
            throw new Error('GITHUB_TOKEN_ENCRYPTION_KEY must differ from JWT_SECRET');
        }
    }
    if (Boolean(env.OPENAI_API_KEY) !== Boolean(env.OPENAI_TASK_DRAFT_MODEL)) {
        throw new Error('OPENAI_API_KEY and OPENAI_TASK_DRAFT_MODEL must be configured together or both omitted');
    }
}
