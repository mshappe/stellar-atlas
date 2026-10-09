import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { GaiaRow } from '../src/atlas-types'
import { cartesianPosition } from '../src/catalog'
import { parseGaiaCsv } from '../src/gaia-csv'
import {
  astrometricCovariance,
  GAIA_REFERENCE_EPOCH,
  hasMeasuredSixDimensionalState,
  propagateGaiaPosition,
  projectedPositionUncertaintyParsecs,
} from '../src/space-motion'

const row: GaiaRow = {
  sourceId: '1',
  ra: 0,
  dec: 0,
  parallax: 100,
  raError: 0.1,
  decError: 0.2,
  parallaxError: 0.3,
  pmra: 100,
  pmraError: 0.4,
  pmdec: 0,
  pmdecError: 0.5,
  radialVelocity: 0,
  radialVelocityError: 0.6,
  raDecCorrelation: 0,
  raParallaxCorrelation: 0,
  raPmraCorrelation: 0,
  raPmdecCorrelation: 0,
  decParallaxCorrelation: 0,
  decPmraCorrelation: 0,
  decPmdecCorrelation: 0,
  parallaxPmraCorrelation: 0,
  parallaxPmdecCorrelation: 0,
  pmraPmdecCorrelation: 0,
}

describe('Gaia space motion', () => {
  it('preserves the catalog position at Gaia DR3 reference epoch', () => {
    expect(propagateGaiaPosition(row, GAIA_REFERENCE_EPOCH)).toEqual(cartesianPosition(row))
  })

  it('moves a source along its measured tangential velocity', () => {
    const projected = propagateGaiaPosition(row, GAIA_REFERENCE_EPOCH + 1)
    expect(projected?.[0]).toBeCloseTo(10)
    expect(projected?.[1]).toBeGreaterThan(0)
    expect(projected?.[2]).toBeCloseTo(0)
  })

  it('refuses to project a source without radial velocity evidence', () => {
    const incomplete = { ...row, radialVelocity: undefined }
    expect(hasMeasuredSixDimensionalState(incomplete)).toBe(false)
    expect(propagateGaiaPosition(incomplete, 5026)).toBeUndefined()
  })

  it('builds the published astrometric covariance matrix', () => {
    const covariance = astrometricCovariance(row)
    expect(covariance?.get(0, 0)).toBeCloseTo((0.1 / 3_600_000) ** 2)
    expect(covariance?.get(1, 1)).toBeCloseTo((0.2 / 3_600_000) ** 2)
    expect(covariance?.get(0, 1)).toBe(0)
    expect(covariance?.isSymmetric()).toBe(true)
  })

  it('rejects a non-positive-definite correlation matrix', () => {
    expect(astrometricCovariance({
      ...row,
      raDecCorrelation: 2,
    })).toBeUndefined()
  })

  it('propagates measured input uncertainty to a finite Cartesian 1σ value', () => {
    const uncertainty = projectedPositionUncertaintyParsecs(row, 5026)
    expect(uncertainty).toBeGreaterThan(0)
    expect(Number.isFinite(uncertainty)).toBe(true)
  })

  it('propagates a finite uncertainty for a committed focused-catalog source', () => {
    const catalog = parseGaiaCsv(readFileSync(new URL('../public/gaia-dr3-confirmed-exoplanet-hosts-trappist-1-300ly.csv', import.meta.url), 'utf8'))
    const source = catalog.rows.find((candidate) => hasMeasuredSixDimensionalState(candidate))
    expect(source).toBeDefined()
    expect(Number.isFinite(projectedPositionUncertaintyParsecs(source!, 5026))).toBe(true)
  })
})
