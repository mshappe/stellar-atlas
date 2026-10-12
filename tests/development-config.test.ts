import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import viteConfig from '../vite.config'

describe('development configuration', () => {
  it('uses configured API proxy environment values', () => {
    const previousPort = process.env.PORT
    const previousTarget = process.env.API_PROXY_TARGET
    process.env.PORT = '4321'
    delete process.env.API_PROXY_TARGET

    try {
      const config = viteConfig({ command: 'serve', mode: 'test', isPreview: false, isSsrBuild: false })
      expect(config.server?.proxy).toEqual({ '/api': 'http://127.0.0.1:4321' })
    } finally {
      if (previousPort === undefined) delete process.env.PORT
      else process.env.PORT = previousPort
      if (previousTarget === undefined) delete process.env.API_PROXY_TARGET
      else process.env.API_PROXY_TARGET = previousTarget
    }
  })

  it('uses the configured Vite port as the API public origin without masking source data', async () => {
    const compose = await readFile('compose.yaml', 'utf8')

    expect(compose).toContain('PUBLIC_ORIGIN: http://localhost:${DEV_HOST_PORT:-5173}')
    expect(compose).not.toContain('dev-source-index')
  })
})
