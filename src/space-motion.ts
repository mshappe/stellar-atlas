import { CholeskyDecomposition, Matrix } from 'ml-matrix'
import type { GaiaRow } from './atlas-types'
import type { CartesianPosition } from './catalog'
import { cartesianPosition } from './catalog'

export const GAIA_REFERENCE_EPOCH = 2016.0
const KILOMETRES_PER_SECOND_TO_PARSEC_PER_JULIAN_YEAR = 31_557_600 / 3.085_677_581_491_367e13
const TANGENTIAL_VELOCITY_FACTOR = 4.740_470_446
const MILLIARCSECONDS_PER_DEGREE = 3_600_000

export function hasMeasuredSixDimensionalState(row: GaiaRow) {
  return [
    row.parallax,
    row.pmra,
    row.pmraError,
    row.pmdec,
    row.pmdecError,
    row.radialVelocity,
    row.radialVelocityError,
  ].every(Number.isFinite)
}

export function propagateGaiaPosition(row: GaiaRow, epoch: number): CartesianPosition | undefined {
  if (!hasMeasuredSixDimensionalState(row) || !Number.isFinite(epoch)) return undefined
  const { pmra, pmdec, radialVelocity } = row
  if (pmra === undefined || pmdec === undefined || radialVelocity === undefined) return undefined
  const [x, y, z] = cartesianPosition(row)
  const rightAscension = row.ra * Math.PI / 180
  const declination = row.dec * Math.PI / 180
  const tangentialScale = TANGENTIAL_VELOCITY_FACTOR / row.parallax
  const velocityKilometresPerSecond = [
    radialVelocity * Math.cos(declination) * Math.cos(rightAscension)
      - tangentialScale * pmra * Math.sin(rightAscension)
      - tangentialScale * pmdec * Math.sin(declination) * Math.cos(rightAscension),
    radialVelocity * Math.cos(declination) * Math.sin(rightAscension)
      + tangentialScale * pmra * Math.cos(rightAscension)
      - tangentialScale * pmdec * Math.sin(declination) * Math.sin(rightAscension),
    radialVelocity * Math.sin(declination)
      + tangentialScale * pmdec * Math.cos(declination),
  ]
  const elapsedYears = epoch - GAIA_REFERENCE_EPOCH
  return [
    x + velocityKilometresPerSecond[0] * KILOMETRES_PER_SECOND_TO_PARSEC_PER_JULIAN_YEAR * elapsedYears,
    y + velocityKilometresPerSecond[1] * KILOMETRES_PER_SECOND_TO_PARSEC_PER_JULIAN_YEAR * elapsedYears,
    z + velocityKilometresPerSecond[2] * KILOMETRES_PER_SECOND_TO_PARSEC_PER_JULIAN_YEAR * elapsedYears,
  ]
}

export function astrometricCovariance(row: GaiaRow): Matrix | undefined {
  const {
    raError, decError, parallaxError, pmraError, pmdecError,
    raDecCorrelation, raParallaxCorrelation, raPmraCorrelation, raPmdecCorrelation,
    decParallaxCorrelation, decPmraCorrelation, decPmdecCorrelation,
    parallaxPmraCorrelation, parallaxPmdecCorrelation, pmraPmdecCorrelation,
  } = row
  if (
    raError === undefined || decError === undefined || parallaxError === undefined || pmraError === undefined || pmdecError === undefined
    || raDecCorrelation === undefined || raParallaxCorrelation === undefined || raPmraCorrelation === undefined || raPmdecCorrelation === undefined
    || decParallaxCorrelation === undefined || decPmraCorrelation === undefined || decPmdecCorrelation === undefined
    || parallaxPmraCorrelation === undefined || parallaxPmdecCorrelation === undefined || pmraPmdecCorrelation === undefined
  ) return undefined
  const errors = [raError / MILLIARCSECONDS_PER_DEGREE, decError / MILLIARCSECONDS_PER_DEGREE, parallaxError, pmraError, pmdecError]
  const correlations = [
    raDecCorrelation, raParallaxCorrelation, raPmraCorrelation, raPmdecCorrelation,
    decParallaxCorrelation, decPmraCorrelation, decPmdecCorrelation,
    parallaxPmraCorrelation, parallaxPmdecCorrelation, pmraPmdecCorrelation,
  ]
  if (![...errors, ...correlations].every(Number.isFinite)) return undefined
  if (correlations.some((correlation) => correlation < -1 || correlation > 1)) return undefined
  const covariance = Matrix.diag(errors.map((error) => error ** 2))
  const pairs: Array<[number, number, number]> = [
    [0, 1, correlations[0]], [0, 2, correlations[1]], [0, 3, correlations[2]], [0, 4, correlations[3]],
    [1, 2, correlations[4]], [1, 3, correlations[5]], [1, 4, correlations[6]],
    [2, 3, correlations[7]], [2, 4, correlations[8]], [3, 4, correlations[9]],
  ]
  for (const [first, second, correlation] of pairs) {
    const value = correlation * errors[first] * errors[second]
    covariance.set(first, second, value)
    covariance.set(second, first, value)
  }

  try {
    new CholeskyDecomposition(covariance)
    return covariance
  } catch {
    return undefined
  }
}

export function projectedPositionUncertaintyParsecs(row: GaiaRow, epoch: number): number | undefined {
  const astrometric = astrometricCovariance(row)
  if (!astrometric || row.radialVelocityError === undefined || !Number.isFinite(row.radialVelocityError)) return undefined
  const values = [row.ra, row.dec, row.parallax, row.pmra, row.pmdec, row.radialVelocity]
  if (values.some((value) => value === undefined || !Number.isFinite(value))) return undefined
  const steps = [1e-4, 1e-4, 1e-4, 1e-4, 1e-4, 1e-4]
  const jacobian = Matrix.zeros(3, 6)
  for (let index = 0; index < values.length; index += 1) {
    const plus = projectWithParameterOffset(row, epoch, index, steps[index]!)
    const minus = projectWithParameterOffset(row, epoch, index, -steps[index]!)
    if (!plus || !minus) return undefined
    for (let coordinate = 0; coordinate < 3; coordinate += 1) {
      jacobian.set(coordinate, index, (plus[coordinate]! - minus[coordinate]!) / (2 * steps[index]!))
    }
  }
  const covariance = Matrix.zeros(6, 6)
  covariance.setSubMatrix(astrometric, 0, 0)
  covariance.set(5, 5, row.radialVelocityError ** 2)
  const projected = jacobian.mmul(covariance).mmul(jacobian.transpose())
  const trace = projected.get(0, 0) + projected.get(1, 1) + projected.get(2, 2)
  return trace >= 0 && Number.isFinite(trace) ? Math.sqrt(trace) : undefined
}

function projectWithParameterOffset(row: GaiaRow, epoch: number, index: number, offset: number) {
  const values = [row.ra, row.dec, row.parallax, row.pmra, row.pmdec, row.radialVelocity]
  values[index]! += offset
  return propagateGaiaPosition({
    ...row,
    ra: values[0]!,
    dec: values[1]!,
    parallax: values[2]!,
    pmra: values[3]!,
    pmdec: values[4]!,
    radialVelocity: values[5]!,
  }, epoch)
}
