// Read once when constructing the router. Operators must restart after changing
// admission policy; request bodies and frontend configuration cannot override it.
export function registrationMode(env = process.env) {
  const mode = env.REGISTRATION_MODE || (['development', 'test'].includes(env.NODE_ENV) ? 'open' : 'restricted');
  if (!['open', 'restricted'].includes(mode)) {
    throw new Error('REGISTRATION_MODE must be open or restricted');
  }
  return mode;
}
