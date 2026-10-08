import { describe, expect, it } from 'vitest'
import {
  appendSelectionEndpoint,
  cartesianPosition,
  cartesianDistance,
  filterLabeledRows,
  formatDisplayName,
  isWithinCartesianRadius,
  pointDistance,
  popSelectionEndpoint,
  relativeCartesianPosition,
  routeDistance,
  routeDistanceFromPositions,
  searchCatalogRows,
  selectedAlternativeLabelIds,
} from '../src/catalog'

describe('formatDisplayName', () => {
  it('expands Flamsteed and Bayer designations', () => {
    expect(formatDisplayName('47 UMa')).toBe('47 Ursae Majoris')
    expect(formatDisplayName('eps Eri')).toBe('Epsilon Eridani')
  })

  it('leaves non-designation catalog names unchanged', () => {
    expect(formatDisplayName('Ross 508')).toBe('Ross 508')
  })
})

describe('Gaia Cartesian positions', () => {
  it('converts right ascension, declination, and parallax to ICRS parsecs', () => {
    expect(cartesianPosition({ ra: 0, dec: 0, parallax: 100 })).toEqual([10, 0, 0])
  })

  it('calculates Euclidean point-to-point distance from those coordinates', () => {
    const first = { ra: 0, dec: 0, parallax: 100 }
    const second = { ra: 90, dec: 0, parallax: 100 }
    expect(pointDistance(first, second)).toBeCloseTo(Math.sqrt(200), 12)
  })
})

describe('filterLabeledRows', () => {
  it('keeps only rows whose source IDs have labels', () => {
    const rows = [{ sourceId: 'labeled' }, { sourceId: 'unlabeled' }]
    expect(filterLabeledRows(rows, new Set(['labeled']))).toEqual([{ sourceId: 'labeled' }])
  })
})

describe('searchCatalogRows', () => {
  it('matches a partial identifier from Gaia, NASA host, planet, or label data', () => {
    const rows = [
      { sourceId: '12345010690', hostNames: 'HD 10697', planetNames: 'HD 10697 b' },
      { sourceId: '987654321', hostNames: 'Wolf 1069', planetNames: 'Wolf 1069 b' },
      { sourceId: '111222333', hostNames: 'Other system' },
    ]
    expect(searchCatalogRows(rows, '1069', { '111222333': 'Catalog 1069 reference' })).toEqual([
      rows[0],
      rows[1],
      rows[2],
    ])
  })

  it('returns no results for blank search text', () => {
    expect(searchCatalogRows([{ sourceId: '123' }], '   ')).toEqual([])
  })

  it('searches aliases retained from another loaded catalog', () => {
    const rows = [{ sourceId: '123' }]
    expect(searchCatalogRows(rows, '1069', {}, { '123': ['Wolf 1069'] })).toEqual(rows)
  })

  it('prioritizes known host aliases ahead of source-ID-only matches', () => {
    const sourceIdMatch = { sourceId: '1231069' }
    const aliasMatch = { sourceId: '456' }
    expect(searchCatalogRows(
      [sourceIdMatch, aliasMatch],
      '1069',
      {},
      { '456': ['Wolf 1069'] },
      1,
    )).toEqual([aliasMatch])
  })
})

describe('selectedAlternativeLabelIds', () => {
  it('retains the selected temporary label without removing official labels', () => {
    expect(selectedAlternativeLabelIds('temporary', new Set(['official']))).toEqual(new Set(['temporary']))
    expect(selectedAlternativeLabelIds('official', new Set(['official']))).toEqual(new Set())
  })
})

describe('popSelectionEndpoint', () => {
  it('removes endpoints in last-selected order', () => {
    const first = { sourceId: 'first' }
    const second = { sourceId: 'second' }
    expect(popSelectionEndpoint([first, second])).toEqual([first])
    expect(popSelectionEndpoint([first])).toEqual([])
  })
})

describe('multi-stop routes', () => {
  it('appends distinct stars in selection order', () => {
    const first = { sourceId: 'first' }
    const second = { sourceId: 'second' }
    const third = { sourceId: 'third' }
    expect(appendSelectionEndpoint([first, second], third)).toEqual([first, second, third])
    expect(appendSelectionEndpoint([first, second], second)).toEqual([first, second])
  })

  it('sums consecutive hops instead of endpoint separation', () => {
    const route = [
      { ra: 0, dec: 0, parallax: 100 },
      { ra: 90, dec: 0, parallax: 100 },
      { ra: 180, dec: 0, parallax: 100 },
    ]
    expect(routeDistance(route)).toBeCloseTo(2 * Math.sqrt(200), 12)
  })

  it('supports a defined Cartesian origin without fabricating Gaia astrometry', () => {
    const sol: [number, number, number] = [0, 0, 0]
    const nearbyStar: [number, number, number] = [3, 4, 0]
    expect(cartesianDistance(sol, nearbyStar)).toBe(5)
    expect(routeDistanceFromPositions([sol, nearbyStar, sol])).toBe(10)
  })

  it('translates a common-frame position from the selected origin', () => {
    expect(relativeCartesianPosition([4, -2, 7], [1, 3, 2])).toEqual([3, -5, 5])
  })

  it('includes only positions on or inside an exact Cartesian sphere', () => {
    expect(isWithinCartesianRadius([3, 4, 0], [0, 0, 0], 5)).toBe(true)
    expect(isWithinCartesianRadius([3, 4, 0.001], [0, 0, 0], 5)).toBe(false)
  })
})
