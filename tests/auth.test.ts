import { describe, expect, it } from 'vitest'
import { createCallbackState, createSignedSession, readSignedSession, verifyCallbackState } from '../server/auth'

const secret = 'test-secret'
const now = 1_700_000_000_000

describe('signed authentication tokens', () => {
  it('accepts valid sessions and rejects tampered or expired ones', () => {
    const token = createSignedSession('mshappe', secret, now, 1_000)

    expect(readSignedSession(token, secret, now)).toEqual({ login: 'mshappe', expiresAt: now + 1_000 })
    expect(readSignedSession(`${token}x`, secret, now)).toBeUndefined()
    expect(readSignedSession(token, secret, now + 1_000)).toBeUndefined()
  })

  it('binds OAuth callbacks to the signed state nonce', () => {
    const state = createCallbackState(secret, now)

    expect(verifyCallbackState(state.nonce, state.token, secret, now)).toBe(true)
    expect(verifyCallbackState('different', state.token, secret, now)).toBe(false)
    expect(verifyCallbackState(state.nonce, state.token, secret, now + 10 * 60 * 1000)).toBe(false)
    expect(readSignedSession(state.token, secret, now)).toBeUndefined()
  })
})
