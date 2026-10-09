import { once } from 'node:events'
import { describe, expect, it } from 'vitest'
import { createApiServer } from '../server/api'

describe('API', () => {
  it('serves public labels without authentication', async () => {
    const server = createApiServer({
      publicOrigin: 'http://127.0.0.1',
      sessionSecret: 'test-secret',
      maintainers: new Set(['mshappe']),
      githubClientId: 'client',
      githubClientSecret: 'secret',
      labelStore: {
        listLabels: () => [],
        listEvents: () => [],
        createMaintainerLabel: () => { throw new Error('not used') },
        schemaVersion: () => 1,
        close: () => {},
      },
      sourceIndex: {
        findLabelCandidates: () => undefined,
        close: () => {},
      },
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('API test server did not bind a TCP port.')

    const response = await fetch(`http://127.0.0.1:${address.port}/api/labels`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ labels: [] })
    server.close()
  })
})
