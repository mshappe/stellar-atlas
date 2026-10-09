import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'

export type Session = {
  login: string
  expiresAt: number
}

type SignedPayload = Session & {
  nonce: string
  kind: 'session'
}

type OAuthStatePayload = {
  expiresAt: number
  nonce: string
}

const OAUTH_STATE_SALT = Buffer.from('stellar-atlas-oauth-state-v1')
const OAUTH_STATE_INFO = Buffer.from('oauth-state-cookie')

export function createSignedSession(login: string, secret: string, now = Date.now(), ttlMilliseconds = 8 * 60 * 60 * 1000) {
  return sign({ login, expiresAt: now + ttlMilliseconds, nonce: randomBytes(16).toString('base64url'), kind: 'session' }, secret)
}

export function readSignedSession(token: string | undefined, secret: string, now = Date.now()): Session | undefined {
  if (!token) return undefined
  const payload = verify(token, secret)
  if (!payload || payload.kind !== 'session' || payload.expiresAt <= now) return undefined
  return { login: payload.login, expiresAt: payload.expiresAt }
}

export function createCallbackState(secret: string, now = Date.now()) {
  const nonce = randomBytes(16).toString('base64url')
  return {
    nonce,
    token: encryptOAuthState({ nonce, expiresAt: now + 10 * 60 * 1000 }, secret),
  }
}

export function verifyCallbackState(state: string | undefined, token: string | undefined, secret: string, now = Date.now()) {
  if (!state || !token) return false
  const payload = decryptOAuthState(token, secret)
  return Boolean(payload && payload.expiresAt > now && timingSafeTextEqual(payload.nonce, state))
}

function sign(payload: SignedPayload, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

function verify(token: string, secret: string): SignedPayload | undefined {
  const [encoded, signature] = token.split('.')
  if (!encoded || !signature) return undefined
  const expected = createHmac('sha256', secret).update(encoded).digest()
  const received = Buffer.from(signature, 'base64url')
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return undefined
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    if (
      typeof payload?.login !== 'string'
      || typeof payload?.expiresAt !== 'number'
      || typeof payload?.nonce !== 'string'
      || payload?.kind !== 'session'
    ) return undefined
    return payload
  } catch {
    return undefined
  }
}

function encryptOAuthState(payload: OAuthStatePayload, secret: string) {
  const initializationVector = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', oauthStateKey(secret), initializationVector)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  return `${initializationVector.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`
}

function decryptOAuthState(token: string, secret: string): OAuthStatePayload | undefined {
  const [initializationVector, authenticationTag, ciphertext] = token.split('.')
  if (!initializationVector || !authenticationTag || !ciphertext) return undefined
  try {
    const decipher = createDecipheriv('aes-256-gcm', oauthStateKey(secret), Buffer.from(initializationVector, 'base64url'))
    decipher.setAuthTag(Buffer.from(authenticationTag, 'base64url'))
    const payload = JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8'))
    if (
      typeof payload?.expiresAt !== 'number'
      || typeof payload?.nonce !== 'string'
    ) return undefined
    return payload
  } catch {
    return undefined
  }
}

function oauthStateKey(secret: string) {
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret), OAUTH_STATE_SALT, OAUTH_STATE_INFO, 32))
}

function timingSafeTextEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}
