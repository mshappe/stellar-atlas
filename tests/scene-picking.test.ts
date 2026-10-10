import { describe, expect, it } from 'vitest'
import { pickClosestScreenPoint } from '../src/scene-picking'

describe('pickClosestScreenPoint', () => {
  it('selects the rendered dot nearest the click instead of a different point along the same view ray', () => {
    const trappist = { sourceId: '2635476908753563008' }
    const unlabeledStar = { sourceId: '1234567890123456789' }

    const selected = pickClosestScreenPoint([
      { value: trappist, x: 500, y: 400, radius: 10 },
      { value: unlabeledStar, x: 620, y: 430, radius: 10 },
    ], 622, 429)

    expect(selected).toBe(unlabeledStar)
  })

  it('does not select a point outside its rendered hit radius', () => {
    expect(pickClosestScreenPoint([
      { value: 'TRAPPIST-1', x: 500, y: 400, radius: 10 },
    ], 511, 400)).toBeUndefined()
  })
})
