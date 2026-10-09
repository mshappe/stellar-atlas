import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createReadStream, promises as filesystem } from 'node:fs'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import { URL } from 'node:url'
import { createCallbackState, createSignedSession, readSignedSession, verifyCallbackState } from './auth'
import { LabelAlreadyExistsError, type LabelStore } from './label-store'
import type { SourceIndex } from './contracts'

const SESSION_COOKIE = 'stellar_atlas_session'
const STATE_COOKIE = 'stellar_atlas_oauth_state'

export type ApiConfig = {
  publicOrigin: string
  sessionSigningSecret: string
  oauthStateSecret: string
  maintainers: ReadonlySet<string>
  githubClientId: string
  githubClientSecret: string
  labelStore: LabelStore
  sourceIndex: SourceIndex
  fetchImplementation?: typeof fetch
  staticDirectory?: string
}

export function createApiServer(config: ApiConfig) {
  const fetchImplementation = config.fetchImplementation ?? fetch
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', config.publicOrigin)
      if (request.method === 'GET' && url.pathname === '/api/labels') {
        return sendJson(response, 200, { labels: config.labelStore.listLabels() })
      }
      if (request.method === 'GET' && url.pathname === '/api/session') {
        const session = readSignedSession(readCookies(request)[SESSION_COOKIE], config.sessionSigningSecret)
        return sendJson(response, 200, {
          authenticated: Boolean(session),
          maintainer: Boolean(session && config.maintainers.has(session.login)),
          login: session?.login,
        })
      }
      if (request.method === 'GET' && url.pathname === '/api/auth/github') {
        const state = createCallbackState(config.oauthStateSecret)
        setCookie(response, STATE_COOKIE, state.token, 10 * 60)
        const authorizationUrl = new URL('https://github.com/login/oauth/authorize')
        authorizationUrl.searchParams.set('client_id', config.githubClientId)
        authorizationUrl.searchParams.set('redirect_uri', `${config.publicOrigin}/api/auth/github/callback`)
        authorizationUrl.searchParams.set('state', state.nonce)
        authorizationUrl.searchParams.set('scope', 'read:user')
        return redirect(response, authorizationUrl.toString())
      }
      if (request.method === 'GET' && url.pathname === '/api/auth/github/callback') {
        if (!verifyCallbackState(url.searchParams.get('state') ?? undefined, readCookies(request)[STATE_COOKIE], config.oauthStateSecret)) {
          return sendJson(response, 400, { error: 'Invalid OAuth state.' })
        }
        const code = url.searchParams.get('code')
        if (!code) return sendJson(response, 400, { error: 'Missing GitHub OAuth code.' })
        const login = await exchangeGitHubLogin(code, config, fetchImplementation)
        if (!config.maintainers.has(login)) return sendJson(response, 403, { error: 'GitHub account is not an atlas maintainer.' })
        setCookie(response, SESSION_COOKIE, createSignedSession(login, config.sessionSigningSecret), 8 * 60 * 60)
        clearCookie(response, STATE_COOKIE)
        return redirect(response, '/')
      }
      if (request.method === 'POST' && url.pathname === '/api/labels') {
        if (!isSameOrigin(request, config.publicOrigin)) return sendJson(response, 403, { error: 'Cross-origin label creation is not allowed.' })
        const session = readSignedSession(readCookies(request)[SESSION_COOKIE], config.sessionSigningSecret)
        if (!session || !config.maintainers.has(session.login)) return sendJson(response, 403, { error: 'Maintainer authentication is required.' })
        const body = await readJson(request)
        if (!isLabelRequest(body)) return sendJson(response, 400, { error: 'sourceId and displayLabel are required.' })
        const source = config.sourceIndex.findLabelCandidates(body.sourceId)
        const candidate = source?.candidates.find((value) => value.displayLabel === body.displayLabel)
        if (!source || !candidate) return sendJson(response, 422, { error: 'The requested label is not a server-verified candidate.' })
        try {
          return sendJson(response, 201, {
            label: config.labelStore.createMaintainerLabel({
              gaiaSourceId: source.sourceId,
              displayLabel: candidate.displayLabel,
              evidence: candidate.evidence,
              createdBy: session.login,
            }),
          })
        } catch (error) {
          if (error instanceof LabelAlreadyExistsError) return sendJson(response, 409, { error: error.message })
          throw error
        }
      }
      if (await serveStaticFile(request, response, url, config.staticDirectory)) return
      return sendJson(response, 404, { error: 'Not found.' })
    } catch (error) {
      if (error instanceof ApiRequestError) return sendJson(response, error.status, { error: error.message })
      console.error(error)
      return sendJson(response, 500, { error: 'Unexpected server error.' })
    }
  })
}

async function serveStaticFile(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  staticDirectory: string | undefined,
) {
  if (!staticDirectory || (request.method !== 'GET' && request.method !== 'HEAD')) return false

  let requestedPath: string
  try {
    requestedPath = decodeURIComponent(url.pathname)
  } catch {
    return false
  }
  const directory = resolve(staticDirectory)
  const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.slice(1)
  let filePath = resolve(directory, relativePath)
  if (!isPathInsideDirectory(directory, filePath)) return false

  try {
    const metadata = await filesystem.stat(filePath)
    if (!metadata.isFile()) return false
  } catch (error) {
    if (!isNotFoundError(error) || !acceptsHtml(request)) return false
    filePath = resolve(directory, 'index.html')
  }

  response.writeHead(200, {
    'Content-Type': contentTypeFor(filePath),
    'Cache-Control': relative(directory, filePath).startsWith('assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-store',
  })
  if (request.method === 'HEAD') {
    response.end()
    return true
  }
  await new Promise<void>((resolveStream, rejectStream) => {
    const stream = createReadStream(filePath)
    stream.once('error', rejectStream)
    response.once('error', rejectStream)
    response.once('finish', resolveStream)
    stream.pipe(response)
  })
  return true
}

function isPathInsideDirectory(directory: string, filePath: string) {
  const pathToFile = relative(directory, filePath)
  return pathToFile === '' || (!pathToFile.startsWith('..') && !isAbsolute(pathToFile))
}

function isNotFoundError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}

function acceptsHtml(request: IncomingMessage) {
  return request.headers.accept?.includes('text/html') ?? false
}

function contentTypeFor(filePath: string) {
  switch (extname(filePath)) {
    case '.css': return 'text/css; charset=utf-8'
    case '.csv': return 'text/csv; charset=utf-8'
    case '.html': return 'text/html; charset=utf-8'
    case '.js': return 'text/javascript; charset=utf-8'
    case '.json': return 'application/json; charset=utf-8'
    case '.svg': return 'image/svg+xml'
    case '.woff2': return 'font/woff2'
    default: return 'application/octet-stream'
  }
}

async function exchangeGitHubLogin(code: string, config: ApiConfig, fetchImplementation: typeof fetch) {
  const tokenResponse = await fetchImplementation('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.githubClientId,
      client_secret: config.githubClientSecret,
      code,
      redirect_uri: `${config.publicOrigin}/api/auth/github/callback`,
    }),
  })
  const token = await tokenResponse.json() as { access_token?: string }
  if (!tokenResponse.ok || !token.access_token) throw new Error('GitHub OAuth token exchange failed.')
  const userResponse = await fetchImplementation('https://api.github.com/user', {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token.access_token}` },
  })
  const user = await userResponse.json() as { login?: string }
  if (!userResponse.ok || !user.login) throw new Error('GitHub account lookup failed.')
  return user.login
}

function readCookies(request: IncomingMessage) {
  return Object.fromEntries((request.headers.cookie ?? '').split(';').flatMap((part) => {
    const [name, ...value] = part.trim().split('=')
    return name ? [[name, decodeURIComponent(value.join('='))]] : []
  }))
}

function isSameOrigin(request: IncomingMessage, origin: string) {
  return request.headers.origin === origin
}

function isLabelRequest(value: unknown): value is { sourceId: string, displayLabel: string } {
  return typeof value === 'object' && value !== null
    && 'sourceId' in value && typeof value.sourceId === 'string'
    && 'displayLabel' in value && typeof value.displayLabel === 'string'
}

async function readJson(request: IncomingMessage) {
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > 8192) throw new ApiRequestError(413, 'Request body is too large.')
  }
  try {
    return JSON.parse(body)
  } catch {
    throw new ApiRequestError(400, 'Request body must be valid JSON.')
  }
}

class ApiRequestError extends Error {
  readonly status: 400 | 413

  constructor(status: 400 | 413, message: string) {
    super(message)
    this.status = status
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

function redirect(response: ServerResponse, location: string) {
  response.writeHead(302, { Location: location, 'Cache-Control': 'no-store' })
  response.end()
}

function setCookie(response: ServerResponse, name: string, value: string, maxAge: number) {
  appendCookie(response, `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax; Secure`)
}

function clearCookie(response: ServerResponse, name: string) {
  appendCookie(response, `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure`)
}

function appendCookie(response: ServerResponse, value: string) {
  const existing = response.getHeader('Set-Cookie')
  response.setHeader('Set-Cookie', Array.isArray(existing) ? [...existing, value] : existing ? [String(existing), value] : [value])
}
