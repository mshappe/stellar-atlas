export type LabelCatalog = {
  labelsBySourceId: Readonly<Record<string, string>>
  sourceIds: ReadonlySet<string>
}

export const EMPTY_LABEL_CATALOG: LabelCatalog = {
  labelsBySourceId: {},
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
    sourceIds: new Set(Object.keys(labelsBySourceId)),
  }
}

export async function loadLabelCatalog(baseUrl: string): Promise<LabelCatalog> {
  const response = await fetch(`${baseUrl}prominent-star-labels.provenance.json`)
  if (!response.ok) throw new Error(`The prominent-star label catalog could not be loaded (HTTP ${response.status}).`)
  return parseLabelCatalog(await response.json())
}

function isLabelDefinition(value: unknown): value is LabelDefinition {
  return isRecord(value)
    && typeof value.gaia_dr3_source_id === 'string'
    && typeof value.display_label === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
