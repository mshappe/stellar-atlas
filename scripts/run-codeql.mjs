import { createHash } from 'node:crypto'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { arch, platform } from 'node:process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { spawnSync } from 'node:child_process'

const bundleVersion = '2.27.2'
const archiveName = `codeql-bundle-javascript-linux64.tar.zst`
const archiveUrl = `https://github.com/github/codeql-action/releases/download/codeql-bundle-v${bundleVersion}/${archiveName}`
const archiveSha256 = 'c85010379fa10172b7a59c6689171cbfe692bcd1a2ab92cdc902e83c375deab5'
const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const cacheDirectory = join(homedir(), '.cache', 'stellar-atlas', 'codeql', bundleVersion)
const codeqlPath = join(cacheDirectory, 'codeql', 'codeql')

if (platform !== 'linux' || arch !== 'x64') {
  throw new Error('Local CodeQL checks currently require Linux x64. Run the same pinned bundle in GitHub Actions on another platform.')
}

await ensureCodeql()
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'stellar-atlas-codeql-'))
try {
  const databaseDirectory = join(temporaryDirectory, 'database')
  const sarifPath = join(temporaryDirectory, 'results.sarif')
  run(codeqlPath, [
    'database',
    'create',
    '--language=javascript-typescript',
    '--build-mode=none',
    `--source-root=${rootDirectory}`,
    `--codescanning-config=${join(rootDirectory, '.github', 'codeql-config.yml')}`,
    databaseDirectory,
  ])
  run(codeqlPath, [
    'database',
    'analyze',
    '--format=sarifv2.1.0',
    `--output=${sarifPath}`,
    databaseDirectory,
  ])
  const sarif = JSON.parse(await readFile(sarifPath, 'utf8'))
  const results = sarif.runs.flatMap((run) => run.results ?? [])
  if (results.length) {
    const findings = results.map((result) => {
      const location = result.locations?.[0]?.physicalLocation
      const artifact = location?.artifactLocation?.uri ?? 'unknown file'
      const line = location?.region?.startLine ?? '?'
      return `${result.ruleId ?? 'unknown rule'} at ${artifact}:${line}`
    })
    throw new Error(`CodeQL found ${results.length} alert(s):\n${findings.join('\n')}`)
  }
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true })
}

async function ensureCodeql() {
  if (existsSync(codeqlPath)) return
  await mkdir(cacheDirectory, { recursive: true })
  const archivePath = join(cacheDirectory, archiveName)
  if (!existsSync(archivePath)) {
    const response = await globalThis.fetch(archiveUrl)
    if (!response.ok || !response.body) throw new Error(`Could not download CodeQL bundle: ${response.status} ${response.statusText}`)
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archivePath))
  }
  const archive = await readFile(archivePath)
  const digest = createHash('sha256').update(archive).digest('hex')
  if (digest !== archiveSha256) {
    await rm(archivePath, { force: true })
    throw new Error('Downloaded CodeQL bundle failed SHA-256 verification.')
  }
  run('tar', ['--zstd', '-xf', archivePath, '-C', cacheDirectory])
  if (!existsSync(codeqlPath)) throw new Error('The CodeQL bundle did not contain the expected executable.')
}

function run(command, arguments_) {
  const result = spawnSync(command, arguments_, { cwd: rootDirectory, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}.`)
}
