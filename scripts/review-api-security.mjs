/* global console, process */

import { readFile } from 'node:fs/promises'

const [auth, api, apiTests] = await Promise.all([
  readFile('server/auth.ts', 'utf8'),
  readFile('server/api.ts', 'utf8'),
  readFile('tests/api.test.ts', 'utf8').catch(() => ''),
])

const requirements = [
  [auth.includes("kind: 'session' | 'oauth-state'"), 'typed session and OAuth-state tokens'],
  [auth.includes("payload.kind !== 'session'"), 'session token-purpose validation'],
  [auth.includes("payload?.kind === 'oauth-state'"), 'OAuth-state token-purpose validation'],
  [api.includes("return sendJson(response, 500, { error: 'Unexpected server error.' })"), 'generic unexpected-server error response'],
  [api.includes("new ApiRequestError(413"), 'oversized JSON rejection'],
  [api.includes("new ApiRequestError(400"), 'malformed JSON rejection'],
  [apiTests.includes('createApiServer'), 'HTTP API integration tests'],
]

const missing = requirements.filter(([present]) => !present).map(([, description]) => description)
if (missing.length) {
  console.error(`API security preflight failed; missing: ${missing.join(', ')}`)
  process.exit(1)
}
