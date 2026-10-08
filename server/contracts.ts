export type LabelOrigin = 'seed' | 'maintainer'

export type LabelSeed = {
  gaiaSourceId: string
  displayLabel: string
  evidence: Record<string, unknown>
}

export type PersistentLabel = LabelSeed & {
  origin: LabelOrigin
  createdAt: string
  createdBy: string | undefined
}

export type LabelEvent = {
  id: number
  gaiaSourceId: string
  eventType: 'seeded' | 'created'
  actorLogin: string | undefined
  occurredAt: string
  payload: Record<string, unknown>
}

export type LabelCandidate = {
  displayLabel: string
  authority: 'NASA Exoplanet Archive hostname' | 'Gaia DR3 source ID'
  evidence: Record<string, string>
}

export type SourceIndex = {
  findLabelCandidates(sourceId: string): {
    sourceId: string
    candidates: LabelCandidate[]
  } | undefined
  close(): void
}
