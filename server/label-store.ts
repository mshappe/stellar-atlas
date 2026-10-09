import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseLabelCatalog } from '../src/label-catalog'
import type { LabelEvent, LabelSeed, MaintainerLabel, PersistentLabel } from './contracts'

const SCHEMA_VERSION = 1
const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url))

export class LabelAlreadyExistsError extends Error {
  constructor(sourceId: string) {
    super(`Gaia DR3 source ID ${sourceId} already has a permanent label.`)
  }
}

export type LabelStore = {
  listLabels(): PersistentLabel[]
  listEvents(): LabelEvent[]
  createMaintainerLabel(label: MaintainerLabel): PersistentLabel
  schemaVersion(): number
  close(): void
}

export function parseLabelSeeds(provenance: unknown): LabelSeed[] {
  const catalog = parseLabelCatalog(provenance)
  if (!isRecord(provenance) || !Array.isArray(provenance.labels)) {
    throw new Error('The prominent-star label catalog must contain a labels array.')
  }

  return provenance.labels.map((record) => {
    if (!isRecord(record) || typeof record.gaia_dr3_source_id !== 'string') {
      throw new Error('A prominent-star label record is invalid.')
    }
    const gaiaSourceId = record.gaia_dr3_source_id.trim()
    const displayLabel = catalog.labelsBySourceId[gaiaSourceId]
    if (!displayLabel) throw new Error(`No display label is available for Gaia DR3 source ID ${gaiaSourceId}.`)
    return { gaiaSourceId, displayLabel, evidence: record }
  })
}

export function openLabelStore(databasePath: string, seeds: LabelSeed[], now = () => new Date().toISOString()): LabelStore {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true })
  const database = new DatabaseSync(databasePath)
  try {
    database.exec(readFileSync(schemaPath, 'utf8'))
    database.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(SCHEMA_VERSION, now())
    seedLabels(database, seeds, now)
  } catch (error) {
    database.close()
    throw error
  }

  return {
    listLabels: () => database.prepare(`
      SELECT gaia_source_id, display_label, evidence_json, origin, created_at, created_by
      FROM labels
      ORDER BY gaia_source_id
    `).all().map((row) => mapLabel(row)),
    listEvents: () => database.prepare(`
      SELECT id, gaia_source_id, event_type, actor_login, occurred_at, payload_json
      FROM label_events
      ORDER BY id
    `).all().map((row) => mapEvent(row)),
    createMaintainerLabel: (label) => createMaintainerLabel(database, label, now),
    schemaVersion: () => {
      const row = database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()
      return isRecord(row) && typeof row.version === 'number' ? row.version : 0
    },
    close: () => database.close(),
  }

}

function seedLabels(database: DatabaseSync, seeds: LabelSeed[], now: () => string) {
  const findLabel = database.prepare('SELECT origin FROM labels WHERE gaia_source_id = ?')
  const findSeedEvent = database.prepare(`
    SELECT id
    FROM label_events
    WHERE gaia_source_id = ? AND event_type = 'seeded'
  `)
  const insertLabel = database.prepare(`
    INSERT INTO labels (gaia_source_id, display_label, evidence_json, origin, created_at, created_by)
    VALUES (?, ?, ?, 'seed', ?, NULL)
  `)
  const insertEvent = database.prepare(`
    INSERT INTO label_events (gaia_source_id, event_type, actor_login, occurred_at, payload_json)
    VALUES (?, 'seeded', NULL, ?, ?)
  `)

  database.exec('BEGIN IMMEDIATE')
  try {
    for (const seed of seeds) {
      const timestamp = now()
      const payload = JSON.stringify({
        display_label: seed.displayLabel,
        evidence: seed.evidence,
      })
      const existingLabel = findLabel.get(seed.gaiaSourceId)
      if (isRecord(existingLabel)) {
        if (existingLabel.origin === 'seed' && !findSeedEvent.get(seed.gaiaSourceId)) {
          insertEvent.run(seed.gaiaSourceId, timestamp, payload)
        }

        continue
      }
      insertLabel.run(seed.gaiaSourceId, seed.displayLabel, JSON.stringify(seed.evidence), timestamp)
      insertEvent.run(seed.gaiaSourceId, timestamp, payload)
    }
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function createMaintainerLabel(database: DatabaseSync, label: MaintainerLabel, now: () => string): PersistentLabel {
  const findLabel = database.prepare('SELECT gaia_source_id FROM labels WHERE gaia_source_id = ?')
  const insertLabel = database.prepare(`
    INSERT INTO labels (gaia_source_id, display_label, evidence_json, origin, created_at, created_by)
    VALUES (?, ?, ?, 'maintainer', ?, ?)
  `)
  const insertEvent = database.prepare(`
    INSERT INTO label_events (gaia_source_id, event_type, actor_login, occurred_at, payload_json)
    VALUES (?, 'created', ?, ?, ?)
  `)
  const createdAt = now()
  database.exec('BEGIN IMMEDIATE')
  try {
    if (findLabel.get(label.gaiaSourceId)) throw new LabelAlreadyExistsError(label.gaiaSourceId)
    insertLabel.run(label.gaiaSourceId, label.displayLabel, JSON.stringify(label.evidence), createdAt, label.createdBy)
    insertEvent.run(label.gaiaSourceId, label.createdBy, createdAt, JSON.stringify({
      display_label: label.displayLabel,
      evidence: label.evidence,
    }))
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
  return {
    ...label,
    origin: 'maintainer',
    createdAt,
  }
}

function mapLabel(row: unknown): PersistentLabel {
  if (
    !isRecord(row)
    || typeof row.gaia_source_id !== 'string'
    || typeof row.display_label !== 'string'
    || typeof row.evidence_json !== 'string'
    || (row.origin !== 'seed' && row.origin !== 'maintainer')
    || typeof row.created_at !== 'string'
    || (row.created_by !== null && typeof row.created_by !== 'string')
  ) {
    throw new Error('The labels table contains an invalid record.')
  }
  return {
    gaiaSourceId: row.gaia_source_id,
    displayLabel: row.display_label,
    evidence: parseJsonRecord(row.evidence_json, 'label evidence'),
    origin: row.origin,
    createdAt: row.created_at,
    createdBy: row.created_by ?? undefined,
  }
}

function mapEvent(row: unknown): LabelEvent {
  if (
    !isRecord(row)
    || typeof row.id !== 'number'
    || typeof row.gaia_source_id !== 'string'
    || (row.event_type !== 'seeded' && row.event_type !== 'created')
    || (row.actor_login !== null && typeof row.actor_login !== 'string')
    || typeof row.occurred_at !== 'string'
    || typeof row.payload_json !== 'string'
  ) {
    throw new Error('The label_events table contains an invalid record.')
  }
  return {
    id: row.id,
    gaiaSourceId: row.gaia_source_id,
    eventType: row.event_type,
    actorLogin: row.actor_login ?? undefined,
    occurredAt: row.occurred_at,
    payload: parseJsonRecord(row.payload_json, 'label event payload'),
  }
}

function parseJsonRecord(value: string, description: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    if (isRecord(parsed)) return parsed
  } catch {
    // The caller receives the explicit validation error below.
  }
  throw new Error(`The ${description} is not a JSON object.`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
