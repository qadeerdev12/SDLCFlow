export function aiUsageOptions(env = process.env) {
  const enabled = env.AI_ENABLED || (['development', 'test'].includes(env.NODE_ENV) ? 'true' : 'false');
  if (!['true', 'false'].includes(enabled)) throw new Error('AI_ENABLED must be true or false');
  const limit = env.AI_DAILY_REQUEST_LIMIT || '100';
  if (!/^[1-9]\d*$/.test(limit) || Number(limit) > 10_000) {
    throw new Error('AI_DAILY_REQUEST_LIMIT must be an integer from 1 to 10000');
  }
  return { enabled: enabled === 'true', dailyLimit: Number(limit) };
}
