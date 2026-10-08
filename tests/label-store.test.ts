import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openLabelStore, parseLabelSeeds } from '../server/label-store'

const temporaryDirectories: string[] = []

function temporaryDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), 'stellar-atlas-labels-'))
  temporaryDirectories.push(directory)
  return join(directory, 'labels.sqlite')
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }))
})

const provenance = {
  labels: [{
    gaia_dr3_source_id: '2635476908753563008',
    display_label: 'TRAPPIST-1',
    nasa_hostname: 'TRAPPIST-1',
  }],
}

describe('label store', () => {
  it('seeds evidence-backed labels and appends one audit event per new seed', () => {
    const store = openLabelStore(temporaryDatabasePath(), parseLabelSeeds(provenance), () => '2026-10-08T00:00:00.000Z')

    expect(store.schemaVersion()).toBe(1)
    expect(store.listLabels()).toEqual([{
      gaiaSourceId: '2635476908753563008',
      displayLabel: 'TRAPPIST-1',
      evidence: provenance.labels[0],
      origin: 'seed',
      createdAt: '2026-10-08T00:00:00.000Z',
      createdBy: undefined,
    }])
    expect(store.listEvents()).toMatchObject([{
      gaiaSourceId: '2635476908753563008',
      eventType: 'seeded',
      occurredAt: '2026-10-08T00:00:00.000Z',
    }])
    store.close()
  })

  it('does not overwrite or duplicate existing seed records on restart', () => {
    const databasePath = temporaryDatabasePath()
    const seeds = parseLabelSeeds(provenance)
    const first = openLabelStore(databasePath, seeds, () => '2026-10-08T00:00:00.000Z')
    first.close()

    const second = openLabelStore(databasePath, seeds, () => '2026-10-09T00:00:00.000Z')

    expect(second.listLabels()).toHaveLength(1)
    expect(second.listEvents()).toHaveLength(1)
    expect(second.listLabels()[0]?.createdAt).toBe('2026-10-08T00:00:00.000Z')
    second.close()
  })
})
