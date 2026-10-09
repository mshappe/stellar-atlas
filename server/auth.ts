import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export type Session = {
  login: string
  expiresAt: number
}

type SignedPayload = Session & {
  nonce: string
}

export function createSignedSession(login: string, secret: string, now = Date.now(), ttlMilliseconds = 8 * 60 * 60 * 1000) {
  return sign({ login, expiresAt: now + ttlMilliseconds, nonce: randomBytes(16).toString('base64url') }, secret)
}

export function readSignedSession(token: string | undefined, secret: string, now = Date.now()): Session | undefined {
  if (!token) return undefined
  const payload = verify(token, secret)
  if (!payload || typeof payload.login !== 'string' || typeof payload.expiresAt !== 'number' || payload.expiresAt <= now) return undefined
  return { login: payload.login, expiresAt: payload.expiresAt }
}

export function createOAuthState(secret: string, now = Date.now()) {
  const nonce = randomBytes(16).toString('base64url')
  return {
    nonce,
    token: sign({ login: 'oauth-state', expiresAt: now + 10 * 60 * 1000, nonce }, secret),
  }
}

export function verifyOAuthState(state: string | undefined, token: string | undefined, secret: string, now = Date.now()) {
  if (!state || !token) return false
  const payload = verify(token, secret)
  return payload?.login === 'oauth-state' && payload.expiresAt > now && payload.nonce === state
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
    ) return undefined
    return payload
  } catch {
    return undefined
  }
}
