import { describe, expect, it } from 'vitest'
import { nextTick, watch } from 'vue'
import { useAtlasState } from '../src/composables/useAtlasState'
import type { GaiaRow, ParsedCatalog } from '../src/atlas-types'
import { parseLabelCatalog } from '../src/label-catalog'

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

const permanentLabels = parseLabelCatalog({
  labels: [{
    gaia_dr3_source_id: '2635476908753563008',
    display_label: 'TRAPPIST-1',
  }],
})

describe('useAtlasState', () => {
  it('activates an exact TRAPPIST-1-relative catalog without proxying away source rows', () => {
    const atlas = useAtlasState()
    atlas.setLabelCatalog(permanentLabels)
    atlas.activateCatalog(catalog, true)

    expect(atlas.state.activeCatalog?.rows).toEqual([trappist, wolf])
    expect(atlas.state.selectedOrigin).toBe(trappist)
    expect(atlas.state.activeFocusedCatalog).toBe(true)
  })

  it('rejects a mismatched bundled row count before changing active state', () => {
    const atlas = useAtlasState()
    atlas.setLabelCatalog(permanentLabels)

    expect(() => atlas.activateCatalog(catalog, true, 3)).toThrow('Expected 3 catalog rows but received 2.')
    expect(atlas.state.activeCatalog).toBeUndefined()
    expect(atlas.state.selectedOrigin.sourceId).toBe('sol')
    expect(atlas.state.knownCatalogIdentifiers).toEqual({})
  })

  it('clears selection and route state when replacing the active catalog', () => {
    const atlas = useAtlasState()
    atlas.setLabelCatalog(permanentLabels)
    atlas.activateCatalog(catalog, true)
    atlas.selectMapObject(wolf)
    atlas.selectMapObject(trappist)

    atlas.activateCatalog({
      rows: [trappist],
      rejected: 0,
      outOfRange: 0,
    }, false)

    expect(atlas.state.selectedObject).toBeUndefined()
    expect(atlas.state.measurementEndpoints).toEqual([])
    expect(atlas.state.activeCatalog?.rows).toEqual([trappist])
    expect(atlas.state.activeFocusedCatalog).toBe(false)
  })

  it('keeps a selected search match label while preserving official label IDs', () => {
    const atlas = useAtlasState()
    atlas.setLabelCatalog(permanentLabels)
    atlas.activateCatalog(catalog, true)

    expect(atlas.runSearch('1069')).toEqual([wolf])
    expect(atlas.displayedLabelIds()).toContain('wolf')

    atlas.locateObject(wolf)
    expect(atlas.state.alternativeLabelIds).toEqual(new Set(['wolf']))
    expect(atlas.displayedLabelIds()).toContain('2635476908753563008')
  })

  it('does not expose filtered search matches as temporary labels', () => {
    const atlas = useAtlasState()
    atlas.setLabelCatalog(permanentLabels)
    atlas.activateCatalog(catalog, true)

    expect(atlas.runSearch('1069', () => false)).toEqual([])
    expect(atlas.state.alternativeLabelIds).toEqual(new Set())
  })

  it('distinguishes locating a result from map selection for route state', () => {
    const atlas = useAtlasState()
    atlas.setLabelCatalog(permanentLabels)
    atlas.activateCatalog(catalog, true)

    atlas.locateObject(wolf)
    expect(atlas.state.measurementEndpoints).toEqual([])

    atlas.selectMapObject(wolf)
    expect(atlas.state.measurementEndpoints).toEqual([wolf])
    atlas.popRouteEndpoint()
    expect(atlas.state.measurementEndpoints).toEqual([])
    expect(atlas.state.selectedObject).toBeUndefined()
  })

  it('can clear a stale selected object without changing the active catalog', () => {
    const atlas = useAtlasState()
    atlas.setLabelCatalog(permanentLabels)
    atlas.activateCatalog(catalog, true)
    atlas.locateObject(wolf)

    atlas.clearSelectedObject()

    expect(atlas.state.selectedObject).toBeUndefined()
    expect(atlas.state.activeCatalog?.rows).toEqual([trappist, wolf])
  })

  it('clears route endpoints without clearing the selected object', () => {
    const atlas = useAtlasState()
    atlas.setLabelCatalog(permanentLabels)
    atlas.activateCatalog(catalog, true)
    atlas.selectMapObject(wolf)

    atlas.clearRoute()

    expect(atlas.state.measurementEndpoints).toEqual([])
    expect(atlas.state.selectedObject).toBe(wolf)
  })

  it('replaces retained aliases so shallow state consumers update', async () => {
    const atlas = useAtlasState()
    let updates = 0
    watch(() => atlas.state.knownCatalogIdentifiers, () => {
      updates += 1
    })

    atlas.activateCatalog(catalog, true)
    await nextTick()

    expect(atlas.state.knownCatalogIdentifiers).toEqual({
      wolf: ['Wolf 1069'],
    })
    expect(updates).toBe(1)
  })
})
