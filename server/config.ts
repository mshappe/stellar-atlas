import { resolve } from 'node:path'

export type ServerConfig = {
  port: number
  publicOrigin: string
  sessionSigningSecret: string
  oauthStateSecret: string
  githubClientId: string
  githubClientSecret: string
  maintainers: Set<string>
  databasePath: string
  sourceIndexPath: string
}

export function loadServerConfig(environment = process.env): ServerConfig {
  const required = (name: string) => {
    const value = environment[name]?.trim()
    if (!value) throw new Error(`${name} must be configured.`)
    return value
  }
  const port = Number(environment.PORT ?? '3000')
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.')
  const publicOrigin = required('PUBLIC_ORIGIN')
  new URL(publicOrigin)
  const maintainers = new Set(required('MAINTAINER_GITHUB_LOGINS').split(',').map((login) => login.trim()).filter(Boolean))
  if (!maintainers.size) throw new Error('MAINTAINER_GITHUB_LOGINS must include at least one login.')
  return {
    port,
    publicOrigin,
    sessionSigningSecret: required('SESSION_SIGNING_SECRET'),
    oauthStateSecret: required('OAUTH_STATE_SECRET'),
    githubClientId: required('GITHUB_CLIENT_ID'),
    githubClientSecret: required('GITHUB_CLIENT_SECRET'),
    maintainers,
    databasePath: resolve(environment.LABEL_DATABASE_PATH ?? 'data/labels.sqlite'),
    sourceIndexPath: resolve(environment.SOURCE_INDEX_PATH ?? 'data/label-source-index.sqlite'),
  }
}
