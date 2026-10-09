<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { BUNDLED_CATALOGS, LIGHT_MEGASECONDS_PER_LIGHT_YEAR, LIGHT_YEARS_PER_PARSEC, SOL } from './atlas-data'
import type { AtlasObject, CatalogKey, GaiaRow } from './atlas-types'
import AtlasScene from './components/AtlasScene.vue'
import CatalogControls from './components/CatalogControls.vue'
import CatalogSearch from './components/CatalogSearch.vue'
import LabelCurationPanel from './components/LabelCurationPanel.vue'
import ReferenceFramePanel from './components/ReferenceFramePanel.vue'
import RoutePanel from './components/RoutePanel.vue'
import SelectionPanel from './components/SelectionPanel.vue'
import { useAtlasState } from './composables/useAtlasState'
import { cartesianDistance, cartesianPosition, formatDisplayName, routeDistanceFromPositions } from './catalog'
import {
  createPersistentLabel,
  loadAtlasSession,
  loadLabelCandidates,
  loadPersistentLabelCatalog,
  type AtlasSession,
  type LabelCandidates,
} from './label-api'
import { addPersistentLabel } from './label-catalog'
import { parseGaiaCsv } from './gaia-csv'

const atlas = useAtlasState()
const scene = ref<InstanceType<typeof AtlasScene>>()
const importStatus = ref('Loading focused stars…')
const catalogState = ref('Loading focused stars…')
const searchStatus = ref('Searches Gaia DR3 IDs, NASA host and planet identifiers, and configured labels.')
const labelCatalogStatus = ref('')
const session = ref<AtlasSession>()
const sessionStatus = ref('')
const labelCandidates = ref<LabelCandidates>()
const candidateError = ref('')
const creationError = ref('')
const isLoadingCandidates = ref(false)
const creatingLabelSourceIds = ref<ReadonlySet<string>>(new Set())
const searchResults = ref<Array<{ object: AtlasObject, name: string, identifiers: string }>>([])
const searchResetId = ref(0)
const selectedBundledCatalogKey = ref<CatalogKey | undefined>('confirmed-hosts')
let catalogLoadId = 0
let labelCatalogLoadId = 0
let candidateLoadId = 0
let curationRequestId = 0

const selectedName = computed(() => atlas.state.selectedObject && sourceDisplayName(atlas.state.selectedObject))
const selectedFields = computed(() => atlas.state.selectedObject ? selectionFields(atlas.state.selectedObject) : [])
const route = computed(() => routeDisplay(atlas.state.measurementEndpoints))
const labelIds = computed(() => atlas.displayedLabelIds())
const selectedGaiaSourceId = computed(() => {
  const object = atlas.state.selectedObject
  return object && !isNonGaiaStar(object) ? object.sourceId : undefined
})
const selectedPermanentLabel = computed(() => selectedGaiaSourceId.value
  ? atlas.state.permanentLabels.labelsBySourceId[selectedGaiaSourceId.value]
  : undefined)
const isCreatingLabel = computed(() => selectedGaiaSourceId.value !== undefined
  && creatingLabelSourceIds.value.has(selectedGaiaSourceId.value))

onMounted(() => {
  void refreshLabelCatalog()
  void refreshSession()
  void loadBundledCatalog('confirmed-hosts')
})

watch([selectedGaiaSourceId, () => session.value?.maintainer], () => {
  curationRequestId += 1
  creationError.value = ''
  void refreshLabelCandidates()
})

async function loadBundledCatalog(catalogKey: keyof typeof BUNDLED_CATALOGS) {
  const definition = BUNDLED_CATALOGS[catalogKey]
  const loadId = ++catalogLoadId
  selectedBundledCatalogKey.value = catalogKey
  importStatus.value = `Loading ${definition.count.toLocaleString()} ${definition.label}…`
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${definition.file}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const parsed = parseGaiaCsv(await response.text())
    if (loadId !== catalogLoadId) return
    atlas.activateCatalog(parsed, definition.focusedCatalog, definition.count)
    resetSearch()
    updateCatalogStatus()
  } catch (error) {
    if (loadId !== catalogLoadId) return
    catalogState.value = 'Catalog unavailable'
    importStatus.value = `The bundled Gaia DR3 volume could not be loaded: ${error instanceof Error ? error.message : 'unknown error'}.`
  }
}

async function importCatalog(file: File) {
  const loadId = ++catalogLoadId
  try {
    const catalog = parseGaiaCsv(await file.text())
    if (loadId !== catalogLoadId) return
    atlas.activateCatalog(catalog, false)
    selectedBundledCatalogKey.value = undefined
    resetSearch()
    updateCatalogStatus()
  } catch (error) {
    if (loadId !== catalogLoadId) return
    importStatus.value = error instanceof Error ? error.message : 'The catalog could not be read.'
  }
}

async function refreshLabelCatalog() {
  const loadId = ++labelCatalogLoadId
  labelCatalogStatus.value = ''
  try {
    const catalog = await loadPersistentLabelCatalog()
    if (loadId !== labelCatalogLoadId) return
    atlas.setLabelCatalog(catalog)
    if (atlas.state.activeCatalog) updateCatalogStatus()
  } catch (error) {
    if (loadId !== labelCatalogLoadId) return
    labelCatalogStatus.value = `Permanent labels are unavailable: ${error instanceof Error ? error.message : 'unknown error'}. Retry to restore them.`
  }
}

async function refreshSession() {
  sessionStatus.value = ''
  try {
    session.value = await loadAtlasSession()
  } catch (error) {
    sessionStatus.value = `Maintainer session is unavailable: ${error instanceof Error ? error.message : 'unknown error'}.`
  }
}

async function refreshLabelCandidates() {
  const sourceId = selectedGaiaSourceId.value
  const loadId = ++candidateLoadId
  labelCandidates.value = undefined
  candidateError.value = ''
  if (!sourceId || !session.value?.maintainer || selectedPermanentLabel.value) {
    isLoadingCandidates.value = false
    return
  }
  isLoadingCandidates.value = true
  try {
    const candidates = await loadLabelCandidates(sourceId)
    if (loadId !== candidateLoadId || selectedGaiaSourceId.value !== sourceId) return
    labelCandidates.value = candidates
  } catch (error) {
    if (loadId !== candidateLoadId) return
    candidateError.value = `Verified label candidates are unavailable: ${error instanceof Error ? error.message : 'unknown error'}.`
  } finally {
    if (loadId === candidateLoadId) isLoadingCandidates.value = false
  }
}

function signInForCuration() {
  window.location.assign('/api/auth/github')
}

async function createLabel(sourceId: string, displayLabel: string) {
  if (creatingLabelSourceIds.value.has(sourceId)) return
  const requestId = ++curationRequestId
  creationError.value = ''
  creatingLabelSourceIds.value = new Set([...creatingLabelSourceIds.value, sourceId])
  try {
    const createdLabel = await createPersistentLabel(sourceId, displayLabel)
    labelCatalogLoadId += 1
    atlas.setLabelCatalog(addPersistentLabel(atlas.state.permanentLabels, createdLabel))
    await refreshLabelCatalog()
    if (!isCurrentCurationRequest(requestId, sourceId)) return
    await refreshLabelCandidates()
    if (!isCurrentCurationRequest(requestId, sourceId)) return
  } catch (error) {
    if (!isCurrentCurationRequest(requestId, sourceId)) return
    creationError.value = `Permanent label could not be created: ${error instanceof Error ? error.message : 'unknown error'}.`
  } finally {
    creatingLabelSourceIds.value = new Set(
      [...creatingLabelSourceIds.value].filter((creatingSourceId) => creatingSourceId !== sourceId),
    )
  }
}

function isCurrentCurationRequest(requestId: number, sourceId: string) {
  return requestId === curationRequestId && selectedGaiaSourceId.value === sourceId
}

function updateCatalogStatus() {
  const rows = atlas.state.activeCatalog?.rows ?? []
  const visibleRows = atlas.state.hideUnlabeledStars
    ? rows.filter((row) => labelIds.value.has(row.sourceId))
    : rows
  const scope = atlas.state.activeFocusedCatalog ? 'focused Gaia DR3 stars' : 'Gaia DR3 sources'
  importStatus.value = atlas.state.hideUnlabeledStars
    ? `${visibleRows.length.toLocaleString()} labeled ${scope} shown.`
    : `${visibleRows.length.toLocaleString()} ${scope} shown.`
  catalogState.value = visibleRows.length
    ? `${visibleRows.length.toLocaleString()} ${atlas.state.activeFocusedCatalog ? 'focused stars' : 'Gaia DR3 sources'} · 300 ly`
    : 'No labeled stars in this catalog'
}

function toggleLabels() {
  atlas.toggleHideUnlabeledStars()
  updateCatalogStatus()
}

function searchCatalog(query: string) {
  if (!query.trim()) {
    searchResults.value = []
    searchStatus.value = 'Enter at least one character to search the active catalog.'
    return
  }
  if (!atlas.state.activeCatalog) {
    searchStatus.value = 'The active catalog is still loading.'
    return
  }
  const results = atlas.runSearch(query)
  searchResults.value = results.map((object) => ({
    object,
    name: sourceDisplayName(object),
    identifiers: searchableIdentifiers(object),
  }))
  searchStatus.value = results.length
    ? `${results.length} matching ${results.length === 1 ? 'star' : 'stars'} shown${results.filter(isGaiaRow).length === 25 ? '; refine the search to narrow results.' : '.'}`
    : `No known catalog identifiers contain “${query}”.`
  updateCatalogStatus()
}

function clearSearchDisplay() {
  searchResults.value = []
  searchStatus.value = 'Press Find to search the active catalog.'
}

function resetSearch() {
  atlas.clearSearch()
  searchResults.value = []
  searchStatus.value = 'Searches Gaia DR3 IDs, NASA host and planet identifiers, and configured labels.'
  searchResetId.value += 1
}

function locateSearchResult(object: AtlasObject) {
  atlas.locateObject(object)
  updateCatalogStatus()
  scene.value?.focusObject(object)
}

function selectMapObject(object: AtlasObject) {
  atlas.selectMapObject(object)
  updateCatalogStatus()
}

function focusMapObject(object: AtlasObject) {
  atlas.locateObject(object)
  updateCatalogStatus()
}

function popRoute() {
  atlas.popRouteEndpoint()
}

function clearRoute() {
  atlas.clearRoute()
}

function sourceDisplayName(object: AtlasObject) {
  if (isNonGaiaStar(object)) return object.name
  return atlas.state.permanentLabels.labelsBySourceId[object.sourceId]
    ?? formatHostNames(object.hostNames ?? atlas.state.knownCatalogIdentifiers[object.sourceId]?.[0])
    ?? `Gaia DR3 ${object.sourceId}`
}

function searchableIdentifiers(object: AtlasObject) {
  if (isNonGaiaStar(object)) return `JPL Horizons · ${object.coordinateBasis}`
  return [...new Set([
    `Gaia DR3 ${object.sourceId}`,
    object.hostNames,
    object.planetNames,
    atlas.state.permanentLabels.labelsBySourceId[object.sourceId],
    ...(atlas.state.knownCatalogIdentifiers[object.sourceId] ?? []),
  ].filter(Boolean))].join(' · ')
}

function selectionFields(object: AtlasObject): Array<[string, string]> {
  if (isNonGaiaStar(object)) {
    const [x, y, z] = object.position
    return [
      ['Object category', 'Star'],
      ['Position source', object.coordinateBasis],
      ['Barycentric ICRS X (pc)', String(x)],
      ['Barycentric ICRS Y (pc)', String(y)],
      ['Barycentric ICRS Z (pc)', String(z)],
      ['Gaia DR3 source ID', 'Not applicable: Sol is not a Gaia source'],
    ]
  }
  const distanceParsecs = 1000 / object.parallax
  const preferredName = atlas.state.permanentLabels.labelsBySourceId[object.sourceId]
  const fields: Array<[string, string]> = [
    ['Gaia source ID', object.sourceId],
    ['RA (deg)', object.ra.toFixed(8)],
    ['Dec (deg)', object.dec.toFixed(8)],
    ['Parallax (mas)', object.parallax.toFixed(5)],
    ['Display distance (pc)', distanceParsecs.toPrecision(7)],
    ['Display distance (ly)', (distanceParsecs * LIGHT_YEARS_PER_PARSEC).toPrecision(7)],
  ]
  if (preferredName && object.hostNames && object.hostNames !== preferredName) fields.unshift(['NASA host identifier(s)', object.hostNames])
  if (object.parallaxError !== undefined && Number.isFinite(object.parallaxError)) fields.push(['Parallax uncertainty (mas)', object.parallaxError.toPrecision(5)])
  if (object.magnitude !== undefined && Number.isFinite(object.magnitude)) {
    fields.push(['Mean G magnitude', object.magnitude.toFixed(4)])
    fields.push(['Display absolute G magnitude', (object.magnitude - 5 * (Math.log10(distanceParsecs) - 1)).toFixed(4)])
  }
  if (object.bpRp !== undefined && Number.isFinite(object.bpRp)) fields.push(['BP−RP color index (mag)', object.bpRp.toFixed(4)])
  if (!preferredName && object.hostNames) fields.push(['NASA host identifier(s)', object.hostNames])
  if (object.sourceCategory) fields.push(['Catalog category', object.sourceCategory])
  if (object.planetCount !== undefined && Number.isFinite(object.planetCount)) fields.push(['Confirmed planets', String(object.planetCount)])
  if (object.planetNames) fields.push(['Planet name(s)', object.planetNames])
  if (object.discoveryMethods) fields.push(['Discovery method(s)', object.discoveryMethods])
  if (object.knownSystemDiameterAu !== undefined && Number.isFinite(object.knownSystemDiameterAu)) fields.push(['Known planetary-system diameter (AU)', object.knownSystemDiameterAu.toPrecision(8)])
  if (object.knownSystemDiameterLightSeconds !== undefined && Number.isFinite(object.knownSystemDiameterLightSeconds)) fields.push(['Known planetary-system diameter (light-seconds)', object.knownSystemDiameterLightSeconds.toPrecision(8)])
  if (object.evidence) fields.push(['Evidence', object.evidence])
  return fields
}

function routeDisplay(endpoints: AtlasObject[]) {
  if (!endpoints.length) return { status: 'Select a first star, then a second star.', fields: [] as Array<[string, string]>, hops: [] as Array<[string, string]> }
  if (endpoints.length === 1) {
    return {
      status: 'First endpoint selected. Select a distinct second star.',
      fields: [['First star', sourceDisplayName(endpoints[0])] as [string, string]],
      hops: [] as Array<[string, string]>,
    }
  }
  const positions = endpoints.map(positionForObject)
  const parsecs = routeDistanceFromPositions(positions)
  const lightYears = parsecs * LIGHT_YEARS_PER_PARSEC
  return {
    status: 'Overall travel distance from the displayed Gaia coordinates.',
    fields: [
      ['Stops', String(endpoints.length)],
      ['Overall distance (ly)', lightYears.toPrecision(8)],
      ['Overall distance (light-megaseconds)', (lightYears * LIGHT_MEGASECONDS_PER_LIGHT_YEAR).toPrecision(8)],
      ['Overall distance (pc)', parsecs.toPrecision(8)],
    ] as Array<[string, string]>,
    hops: endpoints.slice(1).map((endpoint, index) => {
      const hopParsecs = cartesianDistance(positions[index], positions[index + 1])
      return [
        `Hop ${index + 1}: ${sourceDisplayName(endpoints[index])} → ${sourceDisplayName(endpoint)}`,
        `${(hopParsecs * LIGHT_YEARS_PER_PARSEC).toPrecision(8)} ly · ${hopParsecs.toPrecision(8)} pc`,
      ] as [string, string]
    }),
  }
}

function positionForObject(object: AtlasObject): [number, number, number] {
  if (isNonGaiaStar(object)) return object.position
  return cartesianPosition(object)
}

function formatHostNames(hostNames: string | undefined) {
  return hostNames?.split('; ').map((name) => formatDisplayName(name)).join('; ')
}

function isNonGaiaStar(object: AtlasObject): object is typeof SOL {
  return 'position' in object
}

function isGaiaRow(object: AtlasObject): object is GaiaRow {
  return !isNonGaiaStar(object)
}

</script>

<template>
  <main class="atlas">
    <header>
      <div>
        <p class="eyebrow">
          Gaia DR3 spatial viewer
        </p>
        <h1>Stellar Atlas</h1>
      </div>
      <p class="catalog-state">
        {{ catalogState }}
      </p>
    </header>
    <section
      class="workspace"
      aria-label="3D stellar visualization"
    >
      <aside class="sidebar">
        <SelectionPanel
          :name="selectedName"
          :fields="selectedFields"
        />
        <LabelCurationPanel
          :session="session"
          :source-id="selectedGaiaSourceId"
          :existing-label="selectedPermanentLabel"
          :candidates="labelCandidates"
          :session-status="sessionStatus"
          :candidate-error="candidateError"
          :creation-error="creationError"
          :loading-candidates="isLoadingCandidates"
          :creating-label="isCreatingLabel"
          @sign-in="signInForCuration"
          @create="createLabel"
          @retry-candidates="refreshLabelCandidates"
        />
        <RoutePanel
          v-bind="route"
          :has-endpoints="Boolean(atlas.state.measurementEndpoints.length)"
          @clear="clearRoute"
        />
        <CatalogControls
          :selected-catalog-key="selectedBundledCatalogKey"
          :hide-unlabeled-stars="atlas.state.hideUnlabeledStars"
          :import-status="importStatus"
          :label-catalog-status="labelCatalogStatus"
          @change-catalog="loadBundledCatalog"
          @toggle-labels="toggleLabels"
          @import-file="importCatalog"
          @retry-labels="refreshLabelCatalog"
        />
        <CatalogSearch
          :key="searchResetId"
          :results="searchResults"
          :status="searchStatus"
          @search="searchCatalog"
          @locate="locateSearchResult"
          @clear="clearSearchDisplay"
        />
        <ReferenceFramePanel />
      </aside>
      <div class="scene-shell">
        <AtlasScene
          ref="scene"
          :catalog="atlas.state.activeCatalog"
          :selected-origin="atlas.state.selectedOrigin"
          :hide-unlabeled-stars="atlas.state.hideUnlabeledStars"
          :label-ids="labelIds"
          :alternative-label-ids="atlas.state.alternativeLabelIds"
          :permanent-labels="atlas.state.permanentLabels.labelsBySourceId"
          :route-endpoints="atlas.state.measurementEndpoints"
          :display-name="sourceDisplayName"
          @select="selectMapObject"
          @focus="focusMapObject"
          @pop-route="popRoute"
        />
        <p class="scene-hint">
          Drag to orbit · scroll to zoom · double-click a point for its Gaia values
        </p>
      </div>
    </section>
    <footer>
      <span>TRAPPIST-1 is the origin · axes: ICRS Cartesian X, Y, Z · units: parsecs</span>
      <a
        href="https://exoplanetarchive.ipac.caltech.edu/"
        target="_blank"
        rel="noreferrer"
      >NASA Exoplanet Archive</a>
    </footer>
  </main>
</template>
