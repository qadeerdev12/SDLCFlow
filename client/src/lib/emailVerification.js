const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5050/api/v1'

// Proof belongs in the POST body, never the URL or Authorization header. This
// operation changes no session cookies and must not automatically retry.
export async function confirmEmailVerification(token) {
  let response, payload
  try {
    response = await fetch(`${BASE_URL}/auth/verify-email`, {
      method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/json', 'X-SDLCFlow-CSRF': '1' },
      body: JSON.stringify({ token }),
    })
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error()
    payload = await response.json()
  } catch { throw new Error('Verification could not be confirmed. Check your profile before requesting another link.') }
  if (!response.ok) throw Object.assign(new Error(payload?.error?.message || 'Verification could not be confirmed.'), {
    status: response.status, code: payload?.error?.code,
    retryAfter: payload?.error?.retryAfter, resetAt: payload?.error?.resetAt,
  })
  if (response.status !== 200 || payload?.data?.verified !== true) throw new Error('Verification could not be confirmed.')
}
