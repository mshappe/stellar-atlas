import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryDirectories: string[] = []

afterEach(() => {
  while (temporaryDirectories.length) rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
})

function csvRows(path: string) {
  return readFileSync(path, 'utf8').trim().split('\n').slice(1)
}

function runPython(script: string, ...arguments_: string[]) {
  const result = spawnSync('python3', [new URL(`../scripts/${script}`, import.meta.url).pathname, ...arguments_], {
    encoding: 'utf8',
  })
  expect(result.status, result.stderr).toBe(0)
}

describe('catalog generators', () => {
  it('retains a 150-ly default while reproducibly deriving the 300-ly source volume', () => {
    const directory = mkdtempSync(join(tmpdir(), 'stellar-atlas-catalog-'))
    temporaryDirectories.push(directory)
    const broadGaia = join(directory, 'broad.csv')
    const planets = join(directory, 'planets.csv')
    const defaultAll = join(directory, 'default-all.csv')
    const defaultFocused = join(directory, 'default-focused.csv')
    const sourceAll = join(directory, 'source-all.csv')
    const sourceFocused = join(directory, 'source-focused.csv')
    const runtimeAll = join(directory, 'runtime-all.csv')
    const runtimeFocused = join(directory, 'runtime-focused.csv')

    writeFileSync(broadGaia, [
      'source_id,ra,dec,parallax,parallax_error,phot_g_mean_mag,bp_rp',
      '2635476908753563008,0,0,100,0.1,12,2',
      'near-300-only,0,0,16.6666666667,0.1,12,2',
    ].join('\n'))
    writeFileSync(planets, 'hostname,gaia_dr3_id,pl_name,discoverymethod,disc_year,sy_dist,pl_orbsmax,pl_orbeccen\n')

    runPython('build_trappist_centered_catalogs.py', broadGaia, planets, defaultAll, defaultFocused)
    runPython('build_trappist_centered_catalogs.py', '--radius-light-years', '300', broadGaia, planets, sourceAll, sourceFocused)
    runPython('filter_trappist_catalog_radius.py', sourceAll, sourceFocused, runtimeAll, runtimeFocused)

    expect(csvRows(sourceAll)).toHaveLength(2)
    expect(csvRows(defaultAll)).toHaveLength(1)
    expect(csvRows(runtimeAll)).toHaveLength(1)
  })
})
