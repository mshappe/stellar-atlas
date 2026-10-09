import type { GaiaRow, ParsedCatalog } from './atlas-types'

const REQUIRED_COLUMNS = ['source_id', 'ra', 'dec', 'parallax'] as const

export function parseGaiaCsv(text: string): ParsedCatalog {
  const matrix = readCsv(text)
  if (matrix.length < 2) throw new Error('The file has no data rows.')
  const header = matrix[0].map((value) => value.trim().toLowerCase().replace(/^\uFEFF/, ''))
  const missing = REQUIRED_COLUMNS.filter((column) => !header.includes(column))
  if (missing.length) throw new Error(`Missing required Gaia DR3 column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`)
  const column = (name: string) => header.indexOf(name)
  const optional = (name: string, values: string[]) => {
    const value = values[column(name)]
    return value?.trim() ? Number(value) : undefined
  }
  const optionalText = (name: string, values: string[]) => {
    const value = values[column(name)]
    return value?.trim() || undefined
  }
  const optionalBoolean = (name: string, values: string[]) => {
    const value = values[column(name)]?.trim().toLowerCase()
    if (!value) return undefined
    return value === 'true' ? true : value === 'false' ? false : undefined
  }
  const rows: GaiaRow[] = []
  let rejected = 0
  for (const values of matrix.slice(1)) {
    if (values.every((value) => !value.trim())) continue
    const row: GaiaRow = {
      sourceId: values[column('source_id')]?.trim(),
      ra: Number(values[column('ra')]),
      dec: Number(values[column('dec')]),
      parallax: Number(values[column('parallax')]),
      parallaxError: optional('parallax_error', values),
      raError: optional('ra_error', values),
      decError: optional('dec_error', values),
      magnitude: optional('phot_g_mean_mag', values),
      bpRp: optional('bp_rp', values),
      hostNames: optionalText('host_names', values),
      planetCount: optional('planet_count', values),
      planetNames: optionalText('planet_names', values),
      discoveryMethods: optionalText('discovery_methods', values),
      evidence: optionalText('evidence', values),
      knownSystemDiameterAu: optional('known_system_diameter_au', values),
      knownSystemDiameterLightSeconds: optional('known_system_diameter_light_seconds', values),
      sourceCategory: optionalText('source_category', values),
      astrometricParamsSolved: optional('astrometric_params_solved', values),
      pmra: optional('pmra', values),
      pmraError: optional('pmra_error', values),
      pmdec: optional('pmdec', values),
      pmdecError: optional('pmdec_error', values),
      radialVelocity: optional('radial_velocity', values),
      radialVelocityError: optional('radial_velocity_error', values),
      ruwe: optional('ruwe', values),
      duplicatedSource: optionalBoolean('duplicated_source', values),
      raDecCorrelation: optional('ra_dec_corr', values),
      raParallaxCorrelation: optional('ra_parallax_corr', values),
      raPmraCorrelation: optional('ra_pmra_corr', values),
      raPmdecCorrelation: optional('ra_pmdec_corr', values),
      decParallaxCorrelation: optional('dec_parallax_corr', values),
      decPmraCorrelation: optional('dec_pmra_corr', values),
      decPmdecCorrelation: optional('dec_pmdec_corr', values),
      parallaxPmraCorrelation: optional('parallax_pmra_corr', values),
      parallaxPmdecCorrelation: optional('parallax_pmdec_corr', values),
      pmraPmdecCorrelation: optional('pmra_pmdec_corr', values),
    }
    if (!row.sourceId || !Number.isFinite(row.ra) || !Number.isFinite(row.dec) || !Number.isFinite(row.parallax) || row.parallax <= 0) {
      rejected += 1
      continue
    }
    rows.push(row)
  }
  if (!rows.length) throw new Error('No renderable rows found. Positive, finite parallax is required for this view.')
  return { rows, rejected, outOfRange: 0 }
}

function readCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      row.push(value)
      value = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(value)
      rows.push(row)
      row = []
      value = ''
    } else {
      value += character
    }
  }
  if (quoted) throw new Error('The CSV contains an unterminated quoted value.')
  if (value || row.length) {
    row.push(value)
    rows.push(row)
  }
  return rows
}
