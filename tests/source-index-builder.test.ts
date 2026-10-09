import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryDirectories: string[] = []
const builderPath = fileURLToPath(new URL('../scripts/build_label_source_index.py', import.meta.url))

function writeFixture(name: string, content: string) {
  const directory = temporaryDirectories.at(-1)!
  const path = join(directory, name)
  writeFileSync(path, content)
  return path
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }))
})

describe('build_label_source_index', () => {
  it('rejects focused sources that are absent from the exact all-source catalog', () => {
    const directory = mkdtempSync(join(tmpdir(), 'stellar-atlas-source-builder-'))
    temporaryDirectories.push(directory)
    const allSources = writeFixture('all.csv', 'source_id,ra,dec,parallax\n123,0,0,10\n')
    const focusedSources = writeFixture('focused.csv', 'source_id,ra,dec,parallax,host_names\n456,0,0,10,Outside Volume\n')
    const output = join(directory, 'index.sqlite')

    const result = spawnSync('python3', [
      builderPath,
      '--all-sources', allSources,
      '--focused-sources', focusedSources,
      '--output', output,
    ], { encoding: 'utf8' })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('focused Gaia source IDs are absent')
    expect(result.stderr).toContain('456')
  })
})
