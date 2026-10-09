import { describe, expect, it } from 'vitest'
import { createOAuthState, createSignedSession, readSignedSession, verifyOAuthState } from '../server/auth'

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
    const state = createOAuthState(secret, now)

    expect(verifyOAuthState(state.nonce, state.token, secret, now)).toBe(true)
    expect(verifyOAuthState('different', state.token, secret, now)).toBe(false)
    expect(verifyOAuthState(state.nonce, state.token, secret, now + 10 * 60 * 1000)).toBe(false)
    expect(readSignedSession(state.token, secret, now)).toBeUndefined()
  })
})
