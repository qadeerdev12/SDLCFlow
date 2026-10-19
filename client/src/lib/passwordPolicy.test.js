import { describe, expect, it } from 'vitest'
import { newPasswordError } from './passwordPolicy'

describe('new password feedback', () => {
  it.each(['a'.repeat(15), 'a'.repeat(72), '\u{1F600}'.repeat(18), ' a test passphrase '])('accepts valid boundary %j', (password) => {
    expect(newPasswordError(password)).toBe('')
  })
  it.each(['', 'a'.repeat(14), 'a'.repeat(73), '\u{1F600}'.repeat(14), '\u{1F600}'.repeat(19)])('rejects invalid boundary %j', (password) => {
    expect(newPasswordError(password)).not.toBe('')
  })
})
