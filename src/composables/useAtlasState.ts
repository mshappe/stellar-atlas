import { shallowReactive } from 'vue'
import {
  INITIAL_ORIGIN_SOURCE_ID,
  MAX_DISTANCE_PARSECS,
  SOL,
} from '../atlas-data'
import type { AtlasObject, GaiaRow, ParsedCatalog } from '../atlas-types'
import { EMPTY_LABEL_CATALOG, type LabelCatalog } from '../label-catalog'
import {
  appendSelectionEndpoint,
  cartesianPosition,
  isWithinCartesianRadius,
  popSelectionEndpoint,
  searchCatalogRows,
  selectedAlternativeLabelIds,
} from '../catalog'

export type AtlasState = {
  activeCatalog: ParsedCatalog | undefined
  activeFocusedCatalog: boolean
  selectedOrigin: AtlasObject
  selectedObject: AtlasObject | undefined
  hideUnlabeledStars: boolean
  measurementEndpoints: AtlasObject[]
  matchedSearchSourceIds: Set<string>
  alternativeLabelIds: Set<string>
  knownCatalogIdentifiers: Record<string, string[]>
  permanentLabels: LabelCatalog
}

export function useAtlasState() {
  const state = shallowReactive<AtlasState>({
    activeCatalog: undefined,
    activeFocusedCatalog: false,
    selectedOrigin: SOL,
    selectedObject: undefined,
    hideUnlabeledStars: false,
    measurementEndpoints: [],
    matchedSearchSourceIds: new Set(),
    alternativeLabelIds: new Set(),
    knownCatalogIdentifiers: {},
    permanentLabels: EMPTY_LABEL_CATALOG,
  })

  function activateCatalog(catalog: ParsedCatalog, focusedCatalog: boolean, expectedRowCount?: number) {
    const origin = catalog.rows.find((row) => row.sourceId === INITIAL_ORIGIN_SOURCE_ID)
    if (!origin) {
      throw new Error('The active catalog must contain TRAPPIST-1 (Gaia DR3 2635476908753563008), the fixed map origin.')
    }

    const filteredCatalog = filterCatalogToSelectedOrigin(catalog, origin)
    if (expectedRowCount !== undefined && filteredCatalog.rows.length !== expectedRowCount) {
      throw new Error(`Expected ${expectedRowCount.toLocaleString()} catalog rows but received ${filteredCatalog.rows.length.toLocaleString()}.`)
    }

    registerKnownCatalogIdentifiers(catalog.rows)
    state.selectedOrigin = origin
    state.activeCatalog = filteredCatalog
    state.activeFocusedCatalog = focusedCatalog
    clearSearch()
  }

  function toggleHideUnlabeledStars() {
    state.hideUnlabeledStars = !state.hideUnlabeledStars
  }

  function runSearch(query: string) {
    const normalizedQuery = query.trim().toLowerCase()
    const rows = state.activeCatalog
      ? searchCatalogRows(state.activeCatalog.rows, query, state.permanentLabels.labelsBySourceId, state.knownCatalogIdentifiers)
      : []
    state.matchedSearchSourceIds = new Set(rows.map((row) => row.sourceId))
    state.alternativeLabelIds = new Set([...state.matchedSearchSourceIds]
      .filter((sourceId) => !state.permanentLabels.sourceIds.has(sourceId)))
    return [
      ...(SOL.name.toLowerCase().includes(normalizedQuery) || SOL.sourceId.includes(normalizedQuery) ? [SOL] : []),
      ...rows,
    ]
  }

  function clearSearch() {
    state.matchedSearchSourceIds = new Set()
    state.alternativeLabelIds = new Set()
  }

  function locateObject(object: AtlasObject) {
    collapseSearchMatchLabels(object)
    state.selectedObject = object
  }

  function selectMapObject(object: AtlasObject) {
    collapseSearchMatchLabels(object)
    state.selectedObject = object
    state.measurementEndpoints = appendSelectionEndpoint(state.measurementEndpoints, object)
  }

  function popRouteEndpoint() {
    state.measurementEndpoints = popSelectionEndpoint(state.measurementEndpoints)
    state.selectedObject = state.measurementEndpoints.at(-1)
  }

  function clearRoute() {
    state.measurementEndpoints = []
  }

  function displayedLabelIds() {
    return new Set([...state.permanentLabels.sourceIds, ...state.alternativeLabelIds])
  }

  function setLabelCatalog(labelCatalog: LabelCatalog) {
    state.permanentLabels = labelCatalog
  }

  function collapseSearchMatchLabels(object: AtlasObject) {
    if (isNonGaiaStar(object) || !state.matchedSearchSourceIds.has(object.sourceId)) return
    state.matchedSearchSourceIds = new Set([object.sourceId])
    state.alternativeLabelIds = selectedAlternativeLabelIds(object.sourceId, state.permanentLabels.sourceIds)
  }

  function registerKnownCatalogIdentifiers(rows: GaiaRow[]) {
    rows.forEach((row) => {
      const identifiers = [row.hostNames, row.planetNames]
        .filter((identifier): identifier is string => Boolean(identifier))
      if (identifiers.length) state.knownCatalogIdentifiers[row.sourceId] = identifiers
    })
  }

  return {
    state,
    activateCatalog,
    toggleHideUnlabeledStars,
    runSearch,
    clearSearch,
    locateObject,
    selectMapObject,
    popRouteEndpoint,
    clearRoute,
    displayedLabelIds,
    setLabelCatalog,
  }
}

function filterCatalogToSelectedOrigin(catalog: ParsedCatalog, origin: GaiaRow): ParsedCatalog {
  const center = cartesianPosition(origin)
  const rows = catalog.rows.filter((row) => isWithinCartesianRadius(
    cartesianPosition(row),
    center,
    MAX_DISTANCE_PARSECS,
  ))
  if (!rows.length) throw new Error('No catalog sources are within 300 light-years of the selected origin.')
  return {
    rows,
    rejected: catalog.rejected,
    outOfRange: catalog.outOfRange + catalog.rows.length - rows.length,
  }
}

function isNonGaiaStar(object: AtlasObject): object is typeof SOL {
  return 'position' in object
}
