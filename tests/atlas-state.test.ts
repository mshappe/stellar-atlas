import { describe, expect, it } from 'vitest'
import { useAtlasState } from '../src/composables/useAtlasState'
import type { GaiaRow, ParsedCatalog } from '../src/atlas-types'

const trappist: GaiaRow = {
  sourceId: '2635476908753563008',
  ra: 0,
  dec: 0,
  parallax: 100,
}

const wolf: GaiaRow = {
  sourceId: 'wolf',
  ra: 1,
  dec: 0,
  parallax: 100,
  hostNames: 'Wolf 1069',
}

const distant: GaiaRow = {
  sourceId: 'distant',
  ra: 180,
  dec: 0,
  parallax: 1,
}

const catalog: ParsedCatalog = {
  rows: [trappist, wolf, distant],
  rejected: 0,
  outOfRange: 0,
}

describe('useAtlasState', () => {
  it('activates an exact TRAPPIST-1-relative catalog without proxying away source rows', () => {
    const atlas = useAtlasState()
    atlas.activateCatalog(catalog, true)

    expect(atlas.state.activeCatalog?.rows).toEqual([trappist, wolf])
    expect(atlas.state.selectedOrigin).toBe(trappist)
    expect(atlas.state.activeFocusedCatalog).toBe(true)
  })

  it('keeps a selected search match label while preserving official label IDs', () => {
    const atlas = useAtlasState()
    atlas.activateCatalog(catalog, true)

    expect(atlas.runSearch('1069')).toEqual([wolf])
    expect(atlas.displayedLabelIds()).toContain('wolf')

    atlas.locateObject(wolf)
    expect(atlas.state.alternativeLabelIds).toEqual(new Set(['wolf']))
    expect(atlas.displayedLabelIds()).toContain('2635476908753563008')
  })

  it('distinguishes locating a result from map selection for route state', () => {
    const atlas = useAtlasState()
    atlas.activateCatalog(catalog, true)

    atlas.locateObject(wolf)
    expect(atlas.state.measurementEndpoints).toEqual([])

    atlas.selectMapObject(wolf)
    expect(atlas.state.measurementEndpoints).toEqual([wolf])
    atlas.popRouteEndpoint()
    expect(atlas.state.measurementEndpoints).toEqual([])
    expect(atlas.state.selectedObject).toBeUndefined()
  })
})
