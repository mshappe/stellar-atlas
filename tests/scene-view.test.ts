import { describe, expect, it } from 'vitest'
import { DEFAULT_VIEW_RADIUS_LIGHT_YEARS, DEFAULT_VIEW_RADIUS_PARSECS } from '../src/atlas-data'
import { cameraDistanceForViewRadius } from '../src/scene-view'

describe('cameraDistanceForViewRadius', () => {
  it('configures the default view for a 50-light-year radius', () => {
    expect(DEFAULT_VIEW_RADIUS_LIGHT_YEARS).toBe(50)
    expect(DEFAULT_VIEW_RADIUS_PARSECS * 3.2615637771674333).toBeCloseTo(50)
  })

  it('fits the requested radius in a landscape viewport’s vertical field', () => {
    expect(cameraDistanceForViewRadius(75, 90, 2)).toBeCloseTo(75)
  })

  it('fits the requested radius in a portrait viewport’s horizontal field', () => {
    expect(cameraDistanceForViewRadius(75, 90, 0.5)).toBeCloseTo(150)
  })
})
