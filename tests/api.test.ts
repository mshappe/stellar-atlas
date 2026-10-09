import { afterEach, describe, expect, it } from 'vitest'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApiServer, type ApiConfig } from '../server/api'
import { createSignedSession } from '../server/auth'
import { LabelAlreadyExistsError } from '../server/label-store'

const origin = 'http://127.0.0.1'
const sourceId = '1234567890123456789'
const sessionCookie = `stellar_atlas_session=${createSignedSession('mshappe', 'test-session-secret')}`
const servers: Server[] = []
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose())
  })))
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

function startApiServer(overrides: Partial<ApiConfig> = {}) {
  const created: unknown[] = []
  const server = createApiServer({
    publicOrigin: origin,
    sessionSigningSecret: 'test-session-secret',
    oauthStateSecret: 'test-oauth-state-secret',
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
      findLabelCandidates: (requestedSourceId) => requestedSourceId === sourceId
        ? {
            sourceId: requestedSourceId,
            candidates: [{
              displayLabel: 'Verified Host',
              authority: 'NASA Exoplanet Archive hostname',
              evidence: { gaia_dr3_source_id: requestedSourceId, nasa_hostname: 'Verified Host' },
            }],
          }
        : undefined,
      close: () => {},
    },
    ...overrides,
  })
  servers.push(server)
  return { server, created }
}

async function listen(server: Server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('API test server did not bind a TCP port.')
  return `http://127.0.0.1:${address.port}`
}

function labelRequest(displayLabel = 'Verified Host') {
  return JSON.stringify({ sourceId, displayLabel })
}

function postLabel(baseUrl: string, options: { body?: string, cookie?: string, origin?: string } = {}) {
  return fetch(`${baseUrl}/api/labels`, {
    method: 'POST',
    headers: {
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.origin ? { Origin: options.origin } : {}),
      'Content-Type': 'application/json',
    },
    body: options.body ?? labelRequest(),
  })
}

describe('API', () => {
  it('serves public labels and reports session privileges', async () => {
    const { server } = startApiServer()
    const baseUrl = await listen(server)

    await expect(fetch(`${baseUrl}/api/labels`).then((response) => response.json()))
      .resolves.toEqual({ labels: [] })
    await expect(fetch(`${baseUrl}/api/session`).then((response) => response.json()))
      .resolves.toEqual({ authenticated: false, maintainer: false })
    await expect(fetch(`${baseUrl}/api/session`, { headers: { Cookie: sessionCookie } }).then((response) => response.json()))
      .resolves.toEqual({ authenticated: true, maintainer: true, login: 'mshappe' })
    const nonMaintainer = createSignedSession('not-a-maintainer', 'test-session-secret')
    await expect(fetch(`${baseUrl}/api/session`, {
      headers: { Cookie: `stellar_atlas_session=${nonMaintainer}` },
    }).then((response) => response.json())).resolves.toEqual({
      authenticated: true,
      maintainer: false,
      login: 'not-a-maintainer',
    })
  })

  it('requires same-origin maintainer authentication before creating labels', async () => {
    const { server } = startApiServer()
    const baseUrl = await listen(server)
    const nonMaintainer = createSignedSession('not-a-maintainer', 'test-session-secret')

    expect((await postLabel(baseUrl, { origin })).status).toBe(403)
    expect((await postLabel(baseUrl, { cookie: `stellar_atlas_session=${nonMaintainer}`, origin })).status).toBe(403)
    expect((await postLabel(baseUrl, { cookie: sessionCookie })).status).toBe(403)
    expect((await postLabel(baseUrl, { cookie: sessionCookie, origin: 'https://attacker.example' })).status).toBe(403)
  })

  it('accepts only server-verified candidates and reports duplicate labels', async () => {
    const { server, created } = startApiServer({
      labelStore: {
        listLabels: () => [],
        listEvents: () => [],
        createMaintainerLabel: () => {
          throw new LabelAlreadyExistsError(sourceId)
        },
        schemaVersion: () => 1,
        close: () => {},
      },
    })
    const baseUrl = await listen(server)

    expect((await postLabel(baseUrl, {
      body: JSON.stringify({ sourceId: '9999999999999999999', displayLabel: 'Verified Host' }),
      cookie: sessionCookie,
      origin,
    })).status).toBe(422)
    expect((await postLabel(baseUrl, { body: labelRequest('Invented Name'), cookie: sessionCookie, origin })).status).toBe(422)
    expect((await postLabel(baseUrl, { cookie: sessionCookie, origin })).status).toBe(409)
    expect(created).toHaveLength(0)
  })

  it('creates an audited maintainer label for a verified candidate', async () => {
    const { server, created } = startApiServer()
    const baseUrl = await listen(server)

    const response = await postLabel(baseUrl, { cookie: sessionCookie, origin })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      label: { gaiaSourceId: sourceId, displayLabel: 'Verified Host', createdBy: 'mshappe' },
    })
    expect(created).toEqual([{
      gaiaSourceId: sourceId,
      displayLabel: 'Verified Host',
      evidence: { gaia_dr3_source_id: sourceId, nasa_hostname: 'Verified Host' },
      createdBy: 'mshappe',
    }])
  })

  it('returns client errors for malformed and oversized JSON', async () => {
    const { server } = startApiServer()
    const baseUrl = await listen(server)

    expect((await postLabel(baseUrl, { body: '{', cookie: sessionCookie, origin })).status).toBe(400)
    expect((await postLabel(baseUrl, { body: 'x'.repeat(8193), cookie: sessionCookie, origin })).status).toBe(413)
  })

  it('does not disclose unexpected server errors', async () => {
    const { server } = startApiServer({
      labelStore: {
        listLabels: () => [],
        listEvents: () => [],
        createMaintainerLabel: () => {
          throw new Error('private SQLite path /srv/atlas/labels.sqlite')
        },
        schemaVersion: () => 1,
        close: () => {},
      },
    })
    const baseUrl = await listen(server)

    const response = await postLabel(baseUrl, { cookie: sessionCookie, origin })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Unexpected server error.' })
  })

  it('starts GitHub OAuth with a signed state cookie and rejects invalid callbacks', async () => {
    const { server } = startApiServer()
    const baseUrl = await listen(server)

    const authorization = await fetch(`${baseUrl}/api/auth/github`, { redirect: 'manual' })
    expect(authorization.status).toBe(302)
    const location = new URL(authorization.headers.get('location') ?? '')
    const state = location.searchParams.get('state')
    expect(location.origin).toBe('https://github.com')
    expect(location.pathname).toBe('/login/oauth/authorize')
    expect(location.searchParams.get('client_id')).toBe('client')
    expect(state).toBeTruthy()
    const stateCookie = authorization.headers.getSetCookie()[0]
    expect(stateCookie).toContain('stellar_atlas_oauth_state=')
    expect(stateCookie).not.toContain(state)
    expect((await fetch(`${baseUrl}/api/auth/github/callback?code=code&state=wrong`, {
      headers: { Cookie: stateCookie },
    })).status).toBe(400)
    expect((await fetch(`${baseUrl}/api/auth/github/callback?state=${state}`, {
      headers: { Cookie: stateCookie },
    })).status).toBe(400)
  })

  it('creates a session only for an OAuth-authenticated maintainer', async () => {
    const githubRequests: RequestInit[] = []
    const githubFetch: typeof fetch = async (_input, init) => {
      githubRequests.push(init ?? {})
      if (githubRequests.length === 1) return Response.json({ access_token: 'github-token' })
      return Response.json({ login: 'mshappe' })
    }
    const { server } = startApiServer({ fetchImplementation: githubFetch })
    const baseUrl = await listen(server)
    const authorization = await fetch(`${baseUrl}/api/auth/github`, { redirect: 'manual' })
    const state = new URL(authorization.headers.get('location') ?? '').searchParams.get('state')
    const stateCookie = authorization.headers.getSetCookie()[0]

    const callback = await fetch(`${baseUrl}/api/auth/github/callback?code=code&state=${state}`, {
      headers: { Cookie: stateCookie },
      redirect: 'manual',
    })

    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).toBe('/')
    expect(callback.headers.getSetCookie()).toEqual(expect.arrayContaining([
      expect.stringContaining('stellar_atlas_session='),
      expect.stringContaining('stellar_atlas_oauth_state=; Max-Age=0'),
    ]))
    expect(githubRequests).toHaveLength(2)
  })

  it('does not create a session for an OAuth-authenticated non-maintainer', async () => {
    const githubFetch: typeof fetch = async (input) => {
      const url = String(input)
      return url.includes('access_token')
        ? Response.json({ access_token: 'github-token' })
        : Response.json({ login: 'not-a-maintainer' })
    }
    const { server } = startApiServer({ fetchImplementation: githubFetch })
    const baseUrl = await listen(server)
    const authorization = await fetch(`${baseUrl}/api/auth/github`, { redirect: 'manual' })
    const state = new URL(authorization.headers.get('location') ?? '').searchParams.get('state')
    const stateCookie = authorization.headers.getSetCookie()[0]

    const callback = await fetch(`${baseUrl}/api/auth/github/callback?code=code&state=${state}`, {
      headers: { Cookie: stateCookie },
      redirect: 'manual',
    })

    expect(callback.status).toBe(403)
    expect(callback.headers.getSetCookie()).toEqual([])
  })

  it('serves built frontend files without exposing paths outside dist', async () => {
    const staticDirectory = await mkdtemp(join(tmpdir(), 'stellar-atlas-static-'))
    temporaryDirectories.push(staticDirectory)
    await writeFile(join(staticDirectory, 'index.html'), '<main>Stellar Atlas</main>')
    await writeFile(join(staticDirectory, 'asset.js'), 'export {}')
    const { server } = startApiServer({ staticDirectory })
    const baseUrl = await listen(server)

    await expect(fetch(`${baseUrl}/`).then((response) => response.text())).resolves.toBe('<main>Stellar Atlas</main>')
    expect((await fetch(`${baseUrl}/asset.js`)).headers.get('content-type')).toContain('text/javascript')
    expect((await fetch(`${baseUrl}/..%2F..%2Fetc%2Fpasswd`)).status).toBe(404)
  })
})
