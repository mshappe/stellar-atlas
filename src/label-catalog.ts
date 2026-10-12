export type LabelCatalog = {
  labelsBySourceId: Readonly<Record<string, string>>
  revisionsBySourceId: Readonly<Record<string, number>>
  sourceIds: ReadonlySet<string>
}

export type PersistentLabel = {
  gaiaSourceId: string
  displayLabel: string
  revision: number
}

export const EMPTY_LABEL_CATALOG: LabelCatalog = {
  labelsBySourceId: {},
  revisionsBySourceId: {},
  sourceIds: new Set(),
}

type LabelDefinition = {
  gaia_dr3_source_id: string
  display_label: string
}

export function parseLabelCatalog(value: unknown): LabelCatalog {
  if (!isRecord(value) || !Array.isArray(value.labels)) {
    throw new Error('The prominent-star label catalog must contain a labels array.')
  }

  const labelsBySourceId: Record<string, string> = {}
  for (const [index, definition] of value.labels.entries()) {
    if (!isLabelDefinition(definition)) {
      throw new Error(`Label record ${index + 1} must contain a Gaia DR3 source ID and display label.`)
    }
    const sourceId = definition.gaia_dr3_source_id.trim()
    const label = definition.display_label.trim()
    if (!/^\d+$/.test(sourceId)) {
      throw new Error(`Label record ${index + 1} has an invalid Gaia DR3 source ID.`)
    }
    if (!label) throw new Error(`Label record ${index + 1} has an empty display label.`)
    if (labelsBySourceId[sourceId]) {
      throw new Error(`The label catalog contains duplicate Gaia DR3 source ID ${sourceId}.`)
    }
    labelsBySourceId[sourceId] = label
  }

  return {
    labelsBySourceId: Object.freeze(labelsBySourceId),
    revisionsBySourceId: Object.freeze({}),
    sourceIds: new Set(Object.keys(labelsBySourceId)),
  }
}

export function parsePersistentLabelCatalog(value: unknown): LabelCatalog {
  if (!isRecord(value) || !Array.isArray(value.labels)) {
    throw new Error('The persistent label API response must contain a labels array.')
  }
  const labels = value.labels.map((definition, index) => {
    if (!isPersistentLabelDefinition(definition)) {
      throw new Error(`Persistent label record ${index + 1} must contain a Gaia DR3 source ID, display label, and revision.`)
    }
    return {
      gaia_dr3_source_id: definition.gaiaSourceId,
      display_label: definition.displayLabel,
      revision: definition.revision,
    }
  })
  const catalog = catalogFromDefinitions(labels)
  return {
    ...catalog,
    revisionsBySourceId: Object.freeze(Object.fromEntries(
      labels.map(({ gaia_dr3_source_id, revision }) => [gaia_dr3_source_id, revision]),
    )),
  }
}

export function addPersistentLabel(catalog: LabelCatalog, label: PersistentLabel): LabelCatalog {
  const nextCatalog = catalogFromDefinitions([
    ...Object.entries(catalog.labelsBySourceId).map(([gaia_dr3_source_id, display_label]) => ({
      gaia_dr3_source_id,
      display_label,
    })),
    {
      gaia_dr3_source_id: label.gaiaSourceId,
      display_label: label.displayLabel,
    },
  ])
  return {
    ...nextCatalog,
    revisionsBySourceId: Object.freeze({
      ...catalog.revisionsBySourceId,
      [label.gaiaSourceId]: label.revision,
    }),
  }
}

export function removePersistentLabel(catalog: LabelCatalog, sourceId: string): LabelCatalog {
  const nextCatalog = catalogFromDefinitions(
    Object.entries(catalog.labelsBySourceId)
      .filter(([gaiaSourceId]) => gaiaSourceId !== sourceId)
      .map(([gaia_dr3_source_id, display_label]) => ({ gaia_dr3_source_id, display_label })),
  )
  return {
    ...nextCatalog,
    revisionsBySourceId: Object.freeze(Object.fromEntries(
      Object.entries(catalog.revisionsBySourceId)
        .filter(([gaiaSourceId]) => gaiaSourceId !== sourceId),
    )),
  }
}

function isLabelDefinition(value: unknown): value is LabelDefinition {
  return isRecord(value)
    && typeof value.gaia_dr3_source_id === 'string'
    && typeof value.display_label === 'string'
}

function isPersistentLabelDefinition(value: unknown): value is PersistentLabel {
  return isRecord(value)
    && typeof value.gaiaSourceId === 'string'
    && typeof value.displayLabel === 'string'
    && typeof value.revision === 'number'
    && Number.isSafeInteger(value.revision)
    && value.revision > 0
}

function catalogFromDefinitions(definitions: unknown[]): LabelCatalog {
  return parseLabelCatalog({ labels: definitions })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
