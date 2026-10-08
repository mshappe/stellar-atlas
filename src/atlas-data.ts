import type { BundledCatalogDefinition, CatalogKey, NonGaiaStar } from './atlas-types'

export const SOL: NonGaiaStar = {
  sourceId: 'sol',
  name: 'Sol',
  position: [1.812038087014733e-8, 6.814301406306658e-9, -7.81411830683232e-10],
  coordinateBasis: 'JPL Horizons barycentric ICRS position at J2016.0',
}

export const LIGHT_YEARS_PER_PARSEC = 3.2615637771674333
export const LIGHT_MEGASECONDS_PER_LIGHT_YEAR = 31.5576
export const MAX_DISTANCE_LIGHT_YEARS = 300
export const MAX_DISTANCE_PARSECS = MAX_DISTANCE_LIGHT_YEARS / LIGHT_YEARS_PER_PARSEC
export const INITIAL_ORIGIN_SOURCE_ID = '2635476908753563008'

export const PROMINENT_STAR_LABELS: Record<string, string> = {
  '2452378776434477184': 'Tau Ceti',
  '5853498713190525696': 'Proxima Centauri',
  '5164707970261890560': 'Epsilon Eridani',
  '4472832130942575872': "Barnard's Star",
  '2635476908753563008': 'TRAPPIST-1',
  '704967037090946688': '55 Cancri',
  '2835207319109249920': '51 Pegasi',
  '6322070093095493504': 'Gliese 581',
  '1208695640675619584': 'Ross 508',
  '2371032916186181760': 'LHS 1140',
  '4810594479418041856': "Kapteyn's Star",
  '4429785739602747392': "Unukalhai (Serpent's Head)",
}

export const LABELED_SOURCE_IDS = new Set(Object.keys(PROMINENT_STAR_LABELS))

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
