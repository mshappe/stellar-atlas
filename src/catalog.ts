const DEGREE = Math.PI / 180

export type AstrometricPosition = {
  ra: number
  dec: number
  parallax: number
}

export type CartesianPosition = readonly [number, number, number]

const GREEK_DESIGNATIONS: Record<string, string> = {
  alf: 'Alpha',
  bet: 'Beta',
  gam: 'Gamma',
  del: 'Delta',
  eps: 'Epsilon',
  zet: 'Zeta',
  eta: 'Eta',
  the: 'Theta',
  iot: 'Iota',
  kap: 'Kappa',
  lam: 'Lambda',
  mu: 'Mu',
  nu: 'Nu',
  ksi: 'Xi',
  omi: 'Omicron',
  pi: 'Pi',
  rho: 'Rho',
  sig: 'Sigma',
  tau: 'Tau',
  ups: 'Upsilon',
  phi: 'Phi',
  chi: 'Chi',
  psi: 'Psi',
  ome: 'Omega',
}

const CONSTELLATION_GENITIVES: Record<string, string> = {
  And: 'Andromedae', Ant: 'Antliae', Aps: 'Apodis', Aql: 'Aquilae', Aqr: 'Aquarii',
  Ara: 'Arae', Ari: 'Arietis', Aur: 'Aurigae', Boo: 'Bootis', Cae: 'Caeli',
  Cam: 'Camelopardalis', Cap: 'Capricorni', Car: 'Carinae', Cas: 'Cassiopeiae',
  Cen: 'Centauri', Cep: 'Cephei', Cet: 'Ceti', Cha: 'Chamaeleontis', Cir: 'Circini',
  CMa: 'Canis Majoris', CMi: 'Canis Minoris', Cnc: 'Cancri', Col: 'Columbae',
  Com: 'Comae Berenices', CrA: 'Coronae Australis', CrB: 'Coronae Borealis',
  Crt: 'Crateris', Cru: 'Crucis', Crv: 'Corvi', CVn: 'Canum Venaticorum',
  Cyg: 'Cygni', Del: 'Delphini', Dor: 'Doradus', Dra: 'Draconis', Equ: 'Equulei',
  Eri: 'Eridani', For: 'Fornacis', Gem: 'Geminorum', Gru: 'Gruis', Her: 'Herculis',
  Hor: 'Horologii', Hya: 'Hydrae', Hyi: 'Hydri', Ind: 'Indi', Lac: 'Lacertae',
  Leo: 'Leonis', Lep: 'Leporis', Lib: 'Librae', LMi: 'Leonis Minoris', Lup: 'Lupi',
  Lyn: 'Lyncis', Lyr: 'Lyrae', Men: 'Mensae', Mic: 'Microscopii', Mon: 'Monocerotis',
  Mus: 'Muscae', Nor: 'Normae', Oct: 'Octantis', Oph: 'Ophiuchi', Ori: 'Orionis',
  Pav: 'Pavonis', Peg: 'Pegasi', Per: 'Persei', Phe: 'Phoenicis', Pic: 'Pictoris',
  PsA: 'Piscis Austrini', Psc: 'Piscium', Pup: 'Puppis', Pyx: 'Pyxidis', Ret: 'Reticuli',
  Scl: 'Sculptoris', Sco: 'Scorpii', Sct: 'Scuti', Ser: 'Serpentis', Sex: 'Sextantis',
  Sge: 'Sagittae', Sgr: 'Sagittarii', Tau: 'Tauri', Tel: 'Telescopii',
  TrA: 'Trianguli Australis', Tri: 'Trianguli', Tuc: 'Tucanae', UMa: 'Ursae Majoris',
  UMi: 'Ursae Minoris', Vel: 'Velorum', Vir: 'Virginis', Vol: 'Volantis', Vul: 'Vulpeculae',
}

export function cartesianPosition({ ra, dec, parallax }: AstrometricPosition): [number, number, number] {
  const distanceParsecs = 1000 / parallax
  const rightAscension = ra * DEGREE
  const declination = dec * DEGREE
  return [
    distanceParsecs * Math.cos(declination) * Math.cos(rightAscension),
    distanceParsecs * Math.cos(declination) * Math.sin(rightAscension),
    distanceParsecs * Math.sin(declination),
  ]
}

export function pointDistance(first: AstrometricPosition, second: AstrometricPosition) {
  return cartesianDistance(cartesianPosition(first), cartesianPosition(second))
}

export function cartesianDistance(first: CartesianPosition, second: CartesianPosition) {
  const [firstX, firstY, firstZ] = first
  const [secondX, secondY, secondZ] = second
  return Math.hypot(firstX - secondX, firstY - secondY, firstZ - secondZ)
}

export function relativeCartesianPosition(position: CartesianPosition, origin: CartesianPosition): [number, number, number] {
  return [
    position[0] - origin[0],
    position[1] - origin[1],
    position[2] - origin[2],
  ]
}

export function isWithinCartesianRadius(
  position: CartesianPosition,
  center: CartesianPosition,
  radius: number,
) {
  return cartesianDistance(position, center) <= radius
}

export function filterLabeledRows<T extends { sourceId: string }>(rows: T[], labeledSourceIds: ReadonlySet<string>) {
  return rows.filter((row) => labeledSourceIds.has(row.sourceId))
}

export function searchCatalogRows<T extends {
  sourceId: string
  hostNames?: string
  planetNames?: string
}>(
  rows: T[],
  query: string,
  displayLabels: Readonly<Record<string, string>> = {},
  identifierAliases: Readonly<Record<string, readonly string[]>> = {},
  maxResults = 25,
) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery || maxResults <= 0) return []

  return rows.map((row, index) => {
    const aliases = [
      row.hostNames,
      row.planetNames,
      displayLabels[row.sourceId],
      ...(identifierAliases[row.sourceId] ?? []),
    ]
    const aliasMatch = aliases.some((identifier) => identifier?.toLowerCase().includes(normalizedQuery))
    const sourceIdMatch = row.sourceId.toLowerCase().includes(normalizedQuery)
    return { row, index, priority: aliasMatch ? 0 : sourceIdMatch ? 1 : 2 }
  }).filter(({ priority }) => priority < 2)
    .sort((first, second) => first.priority - second.priority || first.index - second.index)
    .slice(0, maxResults)
    .map(({ row }) => row)
}

export function selectedAlternativeLabelIds(
  selectedSourceId: string,
  officialLabelIds: ReadonlySet<string>,
) {
  return officialLabelIds.has(selectedSourceId) ? new Set<string>() : new Set([selectedSourceId])
}

export function popSelectionEndpoint<T>(endpoints: T[]) {
  return endpoints.slice(0, -1)
}

export function appendSelectionEndpoint<T extends { sourceId: string }>(endpoints: T[], next: T) {
  return endpoints.some((endpoint) => endpoint.sourceId === next.sourceId) ? endpoints : [...endpoints, next]
}

export function routeDistance(endpoints: AstrometricPosition[]) {
  return endpoints.slice(1).reduce((distance, endpoint, index) => distance + pointDistance(endpoints[index], endpoint), 0)
}

export function routeDistanceFromPositions(positions: CartesianPosition[]) {
  return positions.slice(1).reduce((distance, position, index) => distance + cartesianDistance(positions[index], position), 0)
}

export function formatDisplayName(name: string) {
  const match = /^(.+?)\s+([A-Za-z]{3})(\s+[A-Z])?$/.exec(name)
  if (!match) return name

  const [, designation, abbreviation, component = ''] = match
  const constellation = CONSTELLATION_GENITIVES[abbreviation]
  if (!constellation) return name
  return `${GREEK_DESIGNATIONS[designation.toLowerCase()] ?? designation} ${constellation}${component}`
}

export function formatMeasurement(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value)
}
