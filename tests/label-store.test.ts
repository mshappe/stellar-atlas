import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LabelAlreadyExistsError, LabelRevisionConflictError, openLabelStore, parseLabelSeeds } from '../server/label-store'

const temporaryDirectories: string[] = []

function temporaryDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), 'stellar-atlas-labels-'))
  temporaryDirectories.push(directory)
  return join(directory, 'labels.sqlite')
}

function createVersionOneDatabase(databasePath: string) {
  const database = new DatabaseSync(databasePath)
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE labels (
      gaia_source_id TEXT PRIMARY KEY,
      display_label TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      origin TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT
    );
    CREATE TABLE label_events (
      id INTEGER PRIMARY KEY,
      gaia_source_id TEXT NOT NULL REFERENCES labels(gaia_source_id),
      event_type TEXT NOT NULL CHECK (event_type IN ('seeded', 'created')),
      actor_login TEXT,
      occurred_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
    CREATE TRIGGER label_events_no_update
    BEFORE UPDATE ON label_events
    BEGIN
      SELECT RAISE(ABORT, 'label events are append-only');
    END;
    CREATE TRIGGER label_events_no_delete
    BEFORE DELETE ON label_events
    BEGIN
      SELECT RAISE(ABORT, 'label events are append-only');
    END;
  `)
  database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)').run('2026-10-07T00:00:00.000Z')
  database.prepare(`
    INSERT INTO labels (gaia_source_id, display_label, evidence_json, origin, created_at, created_by)
    VALUES (?, ?, ?, 'seed', ?, NULL)
  `).run(
    provenance.labels[0].gaia_dr3_source_id,
    provenance.labels[0].display_label,
    JSON.stringify(provenance.labels[0]),
    '2026-10-07T00:00:00.000Z',
  )
  database.prepare(`
    INSERT INTO label_events (gaia_source_id, event_type, actor_login, occurred_at, payload_json)
    VALUES (?, 'seeded', NULL, ?, ?)
  `).run(
    provenance.labels[0].gaia_dr3_source_id,
    '2026-10-07T00:00:00.000Z',
    JSON.stringify({ display_label: provenance.labels[0].display_label, evidence: provenance.labels[0] }),
  )
  database.close()
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

    expect(store.schemaVersion()).toBe(2)
    expect(store.listLabels()).toEqual([{
      gaiaSourceId: '2635476908753563008',
      displayLabel: 'TRAPPIST-1',
      revision: 1,
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

  it('rejects rewriting audit events at the database level', () => {
    const databasePath = temporaryDatabasePath()
    const store = openLabelStore(databasePath, parseLabelSeeds(provenance))
    store.close()
    const database = new DatabaseSync(databasePath)

    expect(() => database.exec('UPDATE label_events SET event_type = \'created\'')).toThrow('label events are append-only')
    expect(() => database.exec('DELETE FROM label_events')).toThrow('label events are append-only')

    database.close()
  })

  it('rolls back labels when their audit event cannot be recorded', () => {
    const databasePath = temporaryDatabasePath()
    const initialStore = openLabelStore(databasePath, [])
    initialStore.close()
    const database = new DatabaseSync(databasePath)
    database.exec(`
      CREATE TRIGGER reject_seed_events
      BEFORE INSERT ON label_events
      BEGIN
        SELECT RAISE(ABORT, 'seed events unavailable');
      END;
    `)
    database.close()

    expect(() => openLabelStore(databasePath, parseLabelSeeds(provenance))).toThrow('seed events unavailable')

    const verificationDatabase = new DatabaseSync(databasePath)
    const labelCount = verificationDatabase.prepare('SELECT COUNT(*) AS count FROM labels').get() as { count: number }
    expect(labelCount.count).toBe(0)
    verificationDatabase.close()
  })

  it('repairs a legacy seeded label that is missing its audit event', () => {
    const databasePath = temporaryDatabasePath()
    const initialStore = openLabelStore(databasePath, [])
    initialStore.close()
    const database = new DatabaseSync(databasePath)
    database.prepare(`
      INSERT INTO labels (gaia_source_id, display_label, evidence_json, origin, created_at, created_by)
      VALUES (?, ?, ?, 'seed', ?, NULL)
    `).run(
      provenance.labels[0].gaia_dr3_source_id,
      provenance.labels[0].display_label,
      JSON.stringify(provenance.labels[0]),
      '2026-10-07T00:00:00.000Z',
    )
    database.close()

    const store = openLabelStore(databasePath, parseLabelSeeds(provenance), () => '2026-10-08T00:00:00.000Z')

    expect(store.listLabels()).toHaveLength(1)
    expect(store.listEvents()).toMatchObject([{
      gaiaSourceId: provenance.labels[0].gaia_dr3_source_id,
      eventType: 'seeded',
      occurredAt: '2026-10-08T00:00:00.000Z',
    }])
    store.close()
  })

  it('creates a maintainer label and its immutable creation event together', () => {
    const store = openLabelStore(temporaryDatabasePath(), [], () => '2026-10-08T00:00:00.000Z')
    const label = {
      gaiaSourceId: '1234567890123456789',
      displayLabel: 'Gaia DR3 1234567890123456789',
      evidence: { gaia_dr3_source_id: '1234567890123456789' },
      createdBy: 'mshappe',
    }

    expect(store.createMaintainerLabel(label)).toMatchObject({
      ...label,
      origin: 'maintainer',
      createdAt: '2026-10-08T00:00:00.000Z',
    })
    expect(store.listEvents()).toMatchObject([{
      gaiaSourceId: label.gaiaSourceId,
      eventType: 'created',
      actorLogin: 'mshappe',
    }])
    expect(() => store.createMaintainerLabel(label)).toThrow(LabelAlreadyExistsError)
    store.close()
  })

  it('retires seed labels without allowing startup to silently restore them', () => {
    const databasePath = temporaryDatabasePath()
    const first = openLabelStore(databasePath, parseLabelSeeds(provenance), () => '2026-10-08T00:00:00.000Z')

    expect(first.retireLabel(provenance.labels[0].gaia_dr3_source_id, 1, 'mshappe')).toMatchObject({
      displayLabel: 'TRAPPIST-1',
      origin: 'seed',
    })
    expect(first.listLabels()).toEqual([])
    expect(first.listEvents().find((event) => event.eventType === 'removed')).toMatchObject({
      gaiaSourceId: provenance.labels[0].gaia_dr3_source_id,
      eventType: 'removed',
      actorLogin: 'mshappe',
    })
    first.close()

    const second = openLabelStore(databasePath, parseLabelSeeds(provenance), () => '2026-10-09T00:00:00.000Z')
    expect(second.listLabels()).toEqual([])
    second.close()
  })

  it('migrates version-one audit history before retiring a label', () => {
    const databasePath = temporaryDatabasePath()
    createVersionOneDatabase(databasePath)

    const store = openLabelStore(databasePath, [], () => '2026-10-08T00:00:00.000Z')

    expect(store.schemaVersion()).toBe(2)
    expect(store.listEvents()).toMatchObject([{
      gaiaSourceId: provenance.labels[0].gaia_dr3_source_id,
      eventType: 'seeded',
      occurredAt: '2026-10-07T00:00:00.000Z',
    }])
    expect(store.retireLabel(provenance.labels[0].gaia_dr3_source_id, 1, 'mshappe')).toMatchObject({
      origin: 'seed',
      createdAt: '2026-10-07T00:00:00.000Z',
    })
    store.close()

    const verificationDatabase = new DatabaseSync(databasePath)
    expect(() => verificationDatabase.exec('UPDATE label_events SET event_type = \'created\'')).toThrow('label events are append-only')
    verificationDatabase.close()
  })

  it('allows a retired source to receive another verified permanent label', () => {
    const store = openLabelStore(temporaryDatabasePath(), [], () => '2026-10-08T00:00:00.000Z')
    const original = {
      gaiaSourceId: '1234567890123456789',
      displayLabel: 'Gaia DR3 1234567890123456789',
      evidence: { gaia_dr3_source_id: '1234567890123456789' },
      createdBy: 'mshappe',
    }
    store.createMaintainerLabel(original)
    store.retireLabel(original.gaiaSourceId, 1, 'mshappe')

    expect(store.createMaintainerLabel({
      ...original,
      displayLabel: 'Verified Host',
      evidence: { gaia_dr3_source_id: original.gaiaSourceId, nasa_hostname: 'Verified Host' },
    })).toMatchObject({ displayLabel: 'Verified Host' })
    expect(store.listEvents().map((event) => event.eventType)).toEqual(['created', 'removed', 'created'])
    store.close()
  })

  it('does not retire a replacement label from a stale confirmation', () => {
    const store = openLabelStore(temporaryDatabasePath(), [], () => '2026-10-08T00:00:00.000Z')
    const original = store.createMaintainerLabel({
      gaiaSourceId: '1234567890123456789',
      displayLabel: 'Original label',
      evidence: { gaia_dr3_source_id: '1234567890123456789' },
      createdBy: 'mshappe',
    })
    store.retireLabel(original.gaiaSourceId, original.revision, 'mshappe')
    const replacement = store.createMaintainerLabel({
      gaiaSourceId: original.gaiaSourceId,
      displayLabel: 'Replacement label',
      evidence: { gaia_dr3_source_id: original.gaiaSourceId, nasa_hostname: 'Replacement label' },
      createdBy: 'another-maintainer',
    })

    expect(() => store.retireLabel(original.gaiaSourceId, original.revision, 'mshappe'))
      .toThrow(LabelRevisionConflictError)
    expect(store.listLabels()).toMatchObject([{
      gaiaSourceId: original.gaiaSourceId,
      displayLabel: 'Replacement label',
      revision: replacement.revision,
    }])
    store.close()
  })
})
