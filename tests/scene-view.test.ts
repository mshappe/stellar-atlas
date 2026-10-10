import { describe, expect, it } from 'vitest'
import { cameraDistanceForViewRadius } from '../src/scene-view'

describe('cameraDistanceForViewRadius', () => {
  it('fits the requested radius in a landscape viewport’s vertical field', () => {
    expect(cameraDistanceForViewRadius(75, 90, 2)).toBeCloseTo(75)
  })

  it('fits the requested radius in a portrait viewport’s horizontal field', () => {
    expect(cameraDistanceForViewRadius(75, 90, 0.5)).toBeCloseTo(150)
  })
})
