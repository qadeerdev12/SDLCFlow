import { githubRetryAt } from './githubRetry'

// Capture the deadline once on failure; rerenders must not extend the wait.
export function projectSummaryError(error, now = Date.now()) {
  const result = { message: error.message || 'Could not generate a project summary.', github: error.code?.startsWith('GITHUB_') || false, guidance: '', retryAt: 0 }
  if (!result.github) return result

  if (error.code === 'GITHUB_RATE_LIMITED') {
    result.message = 'GitHub is limiting requests.'
    result.retryAt = githubRetryAt(error, now)
    result.guidance = `Suggested retry time: ${new Date(result.retryAt).toLocaleString()}. Availability is not guaranteed; no automatic retry will run.`
  } else if (error.code === 'GITHUB_TIMEOUT') {
    result.message = 'GitHub did not respond within 10 seconds.'
    result.guidance = 'Try again shortly, or use tasks only. Reconnecting is not usually needed for a timeout.'
  } else if (error.code === 'GITHUB_RECONNECT_REQUIRED' || error.status === 401) {
    result.message = 'The GitHub connection needs attention.'
    result.guidance = 'Ask the person who linked this repository to reconnect GitHub from their profile, then try again.'
  } else if ([403, 404].includes(error.status)) {
    result.message = 'GitHub could not provide access to the linked repository.'
    result.guidance = 'Ask a project owner or admin to check the repository link and the linked account\'s repository access.'
  } else if (error.code === 'GITHUB_CONTEXT_CHANGED') {
    result.message = 'The GitHub connection changed during generation.'
    result.guidance = 'Check the current repository link, then generate a fresh summary.'
  } else {
    result.message = 'GitHub data is temporarily unavailable.'
    result.guidance = 'Try again shortly. If this continues, ask a project owner or admin to check the GitHub connection.'
  }
  return result
}
