import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import type { LabelCandidate, SourceIndex } from './contracts'

export function openSourceIndex(databasePath: string): SourceIndex {
  if (!existsSync(databasePath)) {
    throw new Error(`The bundled source index does not exist at ${databasePath}.`)
  }
  const database = new DatabaseSync(databasePath, { readOnly: true })
  const findSource = database.prepare(`
    SELECT gaia_source_id, host_names
    FROM catalog_sources
    WHERE gaia_source_id = ?
  `)

  return {
    findLabelCandidates: (sourceId) => {
      if (!/^\d+$/.test(sourceId)) return undefined
      const row = findSource.get(sourceId)
      if (!isSourceRow(row)) return undefined
      const hostNames = row.host_names
        ?.split(';')
        .map((name) => name.trim())
        .filter(Boolean) ?? []
      const candidates: LabelCandidate[] = [
        ...new Set(hostNames),
      ].map((displayLabel) => ({
        displayLabel,
        authority: 'NASA Exoplanet Archive hostname',
        evidence: {
          gaia_dr3_source_id: row.gaia_source_id,
          nasa_hostname: displayLabel,
        },
      }))
      candidates.push({
        displayLabel: `Gaia DR3 ${row.gaia_source_id}`,
        authority: 'Gaia DR3 source ID',
        evidence: {
          gaia_dr3_source_id: row.gaia_source_id,
        },
      })
      return {
        sourceId: row.gaia_source_id,
        candidates,
      }
    },
    close: () => database.close(),
  }
}

function isSourceRow(value: unknown): value is { gaia_source_id: string, host_names: string | null } {
  return typeof value === 'object'
    && value !== null
    && 'gaia_source_id' in value
    && 'host_names' in value
    && typeof value.gaia_source_id === 'string'
    && (typeof value.host_names === 'string' || value.host_names === null)
}
