// The memory provider owns renewal; transports depend on this narrow bridge,
// never on React or a second refresh coordinator. Legacy mode registers nothing.
let owner = null

export function registerSessionRenewal(handler) {
  owner = handler
  return () => { if (owner === handler) owner = null }
}

export function hasSessionRenewal() { return owner !== null }

export async function renewExpiredSession(expiredToken) {
  const expectedOwner = owner
  if (!expectedOwner) throw new Error('Session renewal is not available.')
  const token = await expectedOwner.renew(expiredToken)
  if (owner !== expectedOwner || !expectedOwner.isCurrent(token)) {
    throw Object.assign(new Error('Session changed during renewal.'), { code: 'AUTH_OPERATION_STALE' })
  }
  return token
}

export function isCurrentRenewalToken(token) { return Boolean(owner?.isCurrent(token)) }
