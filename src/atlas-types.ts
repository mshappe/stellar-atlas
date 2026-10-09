export type GaiaRow = {
  sourceId: string
  ra: number
  dec: number
  parallax: number
  parallaxError?: number
  raError?: number
  decError?: number
  magnitude?: number
  bpRp?: number
  hostNames?: string
  planetCount?: number
  planetNames?: string
  discoveryMethods?: string
  evidence?: string
  knownSystemDiameterAu?: number
  knownSystemDiameterLightSeconds?: number
  sourceCategory?: string
  astrometricParamsSolved?: number
  pmra?: number
  pmraError?: number
  pmdec?: number
  pmdecError?: number
  radialVelocity?: number
  radialVelocityError?: number
  radialVelocitySource?: string
  radialVelocityQuality?: string
  radialVelocityBibliographyCode?: string
  ruwe?: number
  duplicatedSource?: boolean
  raDecCorrelation?: number
  raParallaxCorrelation?: number
  raPmraCorrelation?: number
  raPmdecCorrelation?: number
  decParallaxCorrelation?: number
  decPmraCorrelation?: number
  decPmdecCorrelation?: number
  parallaxPmraCorrelation?: number
  parallaxPmdecCorrelation?: number
  pmraPmdecCorrelation?: number
}

export type ParsedCatalog = {
  rows: GaiaRow[]
  rejected: number
  outOfRange: number
}

export type NonGaiaStar = {
  sourceId: 'sol'
  name: 'Sol'
  position: [number, number, number]
  velocity: [number, number, number]
  coordinateBasis: 'JPL Horizons barycentric ICRF state at J2016.0'
}

export type AtlasObject = GaiaRow | NonGaiaStar

export type CatalogKey = 'confirmed-hosts' | 'all-stars'

export type BundledCatalogDefinition = {
  file: string
  count: number
  focusedCatalog: boolean
  label: string
}
