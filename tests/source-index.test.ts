import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openSourceIndex } from '../server/source-index'

const temporaryDirectories: string[] = []

function createSourceIndexDatabase() {
  const directory = mkdtempSync(join(tmpdir(), 'stellar-atlas-sources-'))
  temporaryDirectories.push(directory)
  const databasePath = join(directory, 'sources.sqlite')
  const database = new DatabaseSync(databasePath)
  database.exec(`
    CREATE TABLE catalog_sources (
      gaia_source_id TEXT PRIMARY KEY,
      host_names TEXT
    );
  `)
  database.prepare(`
    INSERT INTO catalog_sources (gaia_source_id, host_names)
    VALUES (?, ?)
  `).run('2635476908753563008', 'TRAPPIST-1; TRAPPIST-1')
  database.prepare(`
    INSERT INTO catalog_sources (gaia_source_id, host_names)
    VALUES (?, NULL)
  `).run('1234567890123456789')
  database.close()
  return databasePath
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }))
})

describe('source index', () => {
  it('returns deduplicated NASA hostnames before the exact Gaia designation', () => {
    const index = openSourceIndex(createSourceIndexDatabase())

    expect(index.findLabelCandidates('2635476908753563008')).toEqual({
      sourceId: '2635476908753563008',
      candidates: [
        {
          displayLabel: 'TRAPPIST-1',
          authority: 'NASA Exoplanet Archive hostname',
          evidence: {
            gaia_dr3_source_id: '2635476908753563008',
            nasa_hostname: 'TRAPPIST-1',
          },
        },
        {
          displayLabel: 'Gaia DR3 2635476908753563008',
          authority: 'Gaia DR3 source ID',
          evidence: {
            gaia_dr3_source_id: '2635476908753563008',
          },
        },
      ],
    })
    index.close()
  })

  it('uses the Gaia designation when no NASA hostname is indexed', () => {
    const index = openSourceIndex(createSourceIndexDatabase())

    expect(index.findLabelCandidates('1234567890123456789')?.candidates).toEqual([{
      displayLabel: 'Gaia DR3 1234567890123456789',
      authority: 'Gaia DR3 source ID',
      evidence: {
        gaia_dr3_source_id: '1234567890123456789',
      },
    }])
    expect(index.findLabelCandidates('not-a-gaia-id')).toBeUndefined()
    expect(index.findLabelCandidates('9999999999999999999')).toBeUndefined()
    index.close()
  })
})
