import { describe, expect, it } from 'vitest'
import type { GaiaRow } from '../src/atlas-types'
import { cartesianPosition } from '../src/catalog'
import {
  astrometricCovariance,
  GAIA_REFERENCE_EPOCH,
  hasMeasuredSixDimensionalState,
  propagateGaiaPosition,
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
    expect(covariance?.get(0, 0)).toBeCloseTo(0.01)
    expect(covariance?.get(1, 1)).toBeCloseTo(0.04)
    expect(covariance?.get(0, 1)).toBe(0)
    expect(covariance?.isSymmetric()).toBe(true)
  })

  it('rejects a non-positive-definite correlation matrix', () => {
    expect(astrometricCovariance({
      ...row,
      raDecCorrelation: 2,
    })).toBeUndefined()
  })
})
