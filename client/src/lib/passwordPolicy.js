// Mirrors server authValidation.js for immediate feedback; the server is authoritative.
export const PASSWORD_HELP = 'Use at least 15 characters. Maximum 72 UTF-8 bytes; Unicode characters may use multiple bytes.'

export function newPasswordError(value) {
  if (typeof value !== 'string' || [...value].length < 15) {
    return 'Use at least 15 characters for your new password.'
  }
  if (new TextEncoder().encode(value).length > 72) {
    return 'Password must not exceed 72 UTF-8 bytes. Unicode characters may use multiple bytes.'
  }
  return ''
}
