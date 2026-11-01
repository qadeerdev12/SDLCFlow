const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5050/api/v1'

// Requesting mail does not change cookies or require an authenticated session.
// Completion instead goes through the auth provider's cross-tab coordinator.
export async function requestPasswordReset(email) {
  let response, payload
  try {
    response = await fetch(`${BASE_URL}/auth/forgot-password`, {
      method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/json', 'X-SDLCFlow-CSRF': '1' },
      body: JSON.stringify({ email }),
    })
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error()
    payload = await response.json()
  } catch {
    throw new Error('We could not confirm your request. Check your inbox before trying again.')
  }
  if (!response.ok) {
    throw Object.assign(new Error(payload?.error?.message || 'Password recovery is unavailable. Please try again later.'), {
      status: response.status, code: payload?.error?.code, retryAfter: payload?.error?.retryAfter,
      resetAt: payload?.error?.resetAt,
    })
  }
  if (response.status !== 202 || typeof payload?.data?.message !== 'string') {
    throw new Error('We could not confirm your request. Check your inbox before trying again.')
  }
}

export function recoveryRetryAt(error) {
  if (error.status !== 429) return 0
  const seconds = Number(error.retryAfter)
  const reset = Date.parse(error.resetAt)
  const deadline = Math.max(Number.isFinite(seconds) && seconds > 0 ? Date.now() + seconds * 1000 : 0,
    Number.isFinite(reset) ? reset : 0)
  return Number.isFinite(deadline) && deadline > Date.now() ? deadline : Date.now() + 60000
}
