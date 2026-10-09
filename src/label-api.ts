import { parsePersistentLabelCatalog, type LabelCatalog, type PersistentLabel } from './label-catalog'

export type AtlasSession = {
  authenticated: boolean
  maintainer: boolean
  login?: string
}

export type LabelCandidate = {
  displayLabel: string
  authority: 'NASA Exoplanet Archive hostname' | 'Gaia DR3 source ID'
}

export type LabelCandidates = {
  sourceId: string
  candidates: LabelCandidate[]
}

export async function loadPersistentLabelCatalog(): Promise<LabelCatalog> {
  return parsePersistentLabelCatalog(await requestJson('/api/labels'))
}

export async function loadAtlasSession(): Promise<AtlasSession> {
  const value = await requestJson('/api/session')
  if (!isAtlasSession(value)) throw new Error('The session API response is invalid.')
  return value
}

export async function loadLabelCandidates(sourceId: string): Promise<LabelCandidates> {
  const value = await requestJson(`/api/labels/candidates?${new URLSearchParams({ sourceId })}`)
  if (!isLabelCandidates(value)) throw new Error('The label candidate API response is invalid.')
  return value
}

export async function createPersistentLabel(sourceId: string, displayLabel: string): Promise<PersistentLabel> {
  const value = await requestJson('/api/labels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceId, displayLabel }),
  })
  if (!isRecord(value) || !isPersistentLabelDefinition(value.label)) {
    throw new Error('The label creation API response is invalid.')
  }
  return value.label
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, init)
  if (!response.ok) {
    const message = await response.json().then((body) => isRecord(body) && typeof body.error === 'string' ? body.error : undefined).catch(() => undefined)
    throw new Error(message ?? `Request failed (HTTP ${response.status}).`)
  }
  return response.json()
}

function isLabelCandidate(value: unknown): value is LabelCandidate {
  return isRecord(value)
    && typeof value.displayLabel === 'string'
    && (value.authority === 'NASA Exoplanet Archive hostname' || value.authority === 'Gaia DR3 source ID')
}

function isAtlasSession(value: unknown): value is AtlasSession {
  return isRecord(value)
    && typeof value.authenticated === 'boolean'
    && typeof value.maintainer === 'boolean'
    && (value.login === undefined || typeof value.login === 'string')
}

function isLabelCandidates(value: unknown): value is LabelCandidates {
  return isRecord(value)
    && typeof value.sourceId === 'string'
    && Array.isArray(value.candidates)
    && value.candidates.every(isLabelCandidate)
}

function isPersistentLabelDefinition(value: unknown): value is PersistentLabel {
  return isRecord(value)
    && typeof value.gaiaSourceId === 'string'
    && typeof value.displayLabel === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
