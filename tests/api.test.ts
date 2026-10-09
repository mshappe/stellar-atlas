import { once } from 'node:events'
import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { createApiServer } from '../server/api'
import { createSignedSession } from '../server/auth'

const origin = 'http://127.0.0.1'

function startApiServer() {
  const created: unknown[] = []
  const server = createApiServer({
    publicOrigin: origin,
    sessionSecret: 'test-secret',
    maintainers: new Set(['mshappe']),
    githubClientId: 'client',
    githubClientSecret: 'secret',
    labelStore: {
      listLabels: () => [],
      listEvents: () => [],
      createMaintainerLabel: (label) => {
        created.push(label)
        return { ...label, origin: 'maintainer' as const, createdAt: '2026-10-08T00:00:00.000Z' }
      },
      schemaVersion: () => 1,
      close: () => {},
    },
    sourceIndex: {
      findLabelCandidates: (sourceId) => sourceId === '1234567890123456789'
        ? {
            sourceId,
            candidates: [{
              displayLabel: 'Verified Host',
              authority: 'NASA Exoplanet Archive hostname',
              evidence: { gaia_dr3_source_id: sourceId, nasa_hostname: 'Verified Host' },
            }],
          }
        : undefined,
      close: () => {},
    },
  })
  return { server, created }
}

async function listen(server: ReturnType<typeof createServer>) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('API test server did not bind a TCP port.')
  return `http://127.0.0.1:${address.port}`
}

describe('API', () => {
  it('serves public labels without authentication', async () => {
    const { server } = startApiServer()
    const baseUrl = await listen(server)
    const response = await fetch(`${baseUrl}/api/labels`)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ labels: [] })
    server.close()
  })

  it('protects label creation by origin, session, and verified candidate', async () => {
    const { server, created } = startApiServer()
    const baseUrl = await listen(server)
    const body = JSON.stringify({ sourceId: '1234567890123456789', displayLabel: 'Verified Host' })

    expect((await fetch(`${baseUrl}/api/labels`, { method: 'POST', body })).status).toBe(403)
    const cookie = `stellar_atlas_session=${createSignedSession('mshappe', 'test-secret')}`
    expect((await fetch(`${baseUrl}/api/labels`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
      body,
    })).status).toBe(403)
    expect((await fetch(`${baseUrl}/api/labels`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: '1234567890123456789', displayLabel: 'Invented Name' }),
    })).status).toBe(422)
    const success = await fetch(`${baseUrl}/api/labels`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
      body,
    })
    expect(success.status).toBe(201)
    expect(created).toHaveLength(1)
    server.close()
  })
})
