import type { BundledCatalogDefinition, CatalogKey, NonGaiaStar } from './atlas-types'

export const SOL: NonGaiaStar = {
  sourceId: 'sol',
  name: 'Sol',
  position: [1.812038087014733e-8, 6.562827081439886e-9, 1.9936420953229955e-9],
  velocity: [1.5168618133833458e-9, 1.1225114704903383e-8, 4.813011644925665e-9],
  coordinateBasis: 'JPL Horizons barycentric ICRF state at J2016.0',
}

export const LIGHT_YEARS_PER_PARSEC = 3.2615637771674333
export const LIGHT_MEGASECONDS_PER_LIGHT_YEAR = 31.5576
export const MAX_DISTANCE_LIGHT_YEARS = 300
export const MAX_DISTANCE_PARSECS = MAX_DISTANCE_LIGHT_YEARS / LIGHT_YEARS_PER_PARSEC
export const INITIAL_ORIGIN_SOURCE_ID = '2635476908753563008'

export const BUNDLED_CATALOGS = {
  'confirmed-hosts': {
    file: 'gaia-dr3-confirmed-exoplanet-hosts-trappist-1-300ly.csv',
    count: 1_000,
    focusedCatalog: true,
    label: 'focused stars',
  },
  'all-stars': {
    file: 'gaia-dr3-trappist-1-300ly.csv',
    count: 443_660,
    focusedCatalog: false,
    label: 'Gaia DR3 sources',
  },
} satisfies Record<CatalogKey, BundledCatalogDefinition>
