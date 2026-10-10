<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BUNDLED_CATALOGS, LIGHT_MEGASECONDS_PER_LIGHT_YEAR, LIGHT_YEARS_PER_PARSEC, MAX_DISTANCE_LIGHT_YEARS, MAXIMUM_PROJECTION_EPOCH, MINIMUM_PROJECTION_EPOCH, SOL } from './atlas-data'
import type { AtlasObject, CatalogKey, GaiaRow } from './atlas-types'
import AtlasScene from './components/AtlasScene.vue'
import CatalogControls from './components/CatalogControls.vue'
import CatalogSearch from './components/CatalogSearch.vue'
import LabelCurationPanel from './components/LabelCurationPanel.vue'
import ReferenceFramePanel from './components/ReferenceFramePanel.vue'
import RoutePanel from './components/RoutePanel.vue'
import SelectionPanel from './components/SelectionPanel.vue'
import { useAtlasState } from './composables/useAtlasState'
import { cartesianDistance, cartesianPosition, formatDisplayName, formatMeasurement, routeDistanceFromPositions } from './catalog'
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
import { astrometricCovariance, GAIA_REFERENCE_EPOCH, hasMeasuredSixDimensionalState, projectedPositionUncertaintyParsecs, propagateGaiaPosition } from './space-motion'

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
const selectedBundledCatalogKey = ref<CatalogKey | undefined>()
const projectionEpoch = ref<number | undefined>()
const projectionRendering = ref(false)
const MINIMUM_PROJECTION_PROGRESS_MS = 300
let projectionProgressStartedAt = 0
let projectionProgressTimer: ReturnType<typeof setTimeout> | undefined
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
const projectedSourceCount = computed(() => projectionEpoch.value === undefined
  ? undefined
  : (atlas.state.activeCatalog?.rows.filter(hasMeasuredSixDimensionalState).length ?? 0))

function setProjectionEpoch(epoch: number | undefined) {
  if (epoch !== undefined && !atlas.state.activeFocusedCatalog) return
  if (epoch !== undefined && (!Number.isFinite(epoch) || epoch < MINIMUM_PROJECTION_EPOCH || epoch > MAXIMUM_PROJECTION_EPOCH)) return
  if (projectionEpoch.value === epoch) return
  const enteringProjectedMode = projectionEpoch.value === undefined && epoch !== undefined
  if (projectionProgressTimer !== undefined) {
    clearTimeout(projectionProgressTimer)
    projectionProgressTimer = undefined
  }
  projectionEpoch.value = epoch
  projectionRendering.value = true
  projectionProgressStartedAt = performance.now()
  if (enteringProjectedMode) {
    resetSearch()
    if (atlas.state.selectedObject && isGaiaRow(atlas.state.selectedObject) && !hasMeasuredSixDimensionalState(atlas.state.selectedObject)) {
      atlas.clearSelectedObject()
    }
  }
  atlas.clearRoute()
}

function finishProjectionRender() {
  const remaining = Math.max(0, MINIMUM_PROJECTION_PROGRESS_MS - (performance.now() - projectionProgressStartedAt))
  projectionProgressTimer = setTimeout(() => {
    projectionRendering.value = false
    projectionProgressTimer = undefined
  }, remaining)
}

onMounted(() => {
  void refreshLabelCatalog()
  void refreshSession()
  void loadBundledCatalog('confirmed-hosts')
})

onBeforeUnmount(() => {
  if (projectionProgressTimer !== undefined) clearTimeout(projectionProgressTimer)
})

watch([selectedGaiaSourceId, () => session.value?.maintainer], () => {
  curationRequestId += 1
  creationError.value = ''
  void refreshLabelCandidates()
})

async function loadBundledCatalog(catalogKey: keyof typeof BUNDLED_CATALOGS) {
  const definition = BUNDLED_CATALOGS[catalogKey]
  const loadId = ++catalogLoadId
  importStatus.value = `Loading ${definition.count.toLocaleString()} ${definition.label}…`
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${definition.file}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const parsed = parseGaiaCsv(await response.text())
    if (loadId !== catalogLoadId) return
    atlas.activateCatalog(parsed, definition.focusedCatalog, definition.count)
    selectedBundledCatalogKey.value = catalogKey
    if (!definition.focusedCatalog) setProjectionEpoch(undefined)
    resetSearch()
    updateCatalogStatus()
  } catch (error) {
    if (loadId !== catalogLoadId) return
    if (!atlas.state.activeCatalog) catalogState.value = 'Catalog unavailable'
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
    setProjectionEpoch(undefined)
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
    ? `${visibleRows.length.toLocaleString()} ${atlas.state.activeFocusedCatalog ? 'focused stars' : 'Gaia DR3 sources'} · ${MAX_DISTANCE_LIGHT_YEARS} ly`
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
  const results = atlas.runSearch(query, (object) => (
    isNonGaiaStar(object)
    || projectionEpoch.value === undefined
    || hasMeasuredSixDimensionalState(object)
  ))
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
    const elapsedYears = projectionEpoch.value === undefined ? 0 : projectionEpoch.value - GAIA_REFERENCE_EPOCH
    const [x, y, z] = object.position.map((value, index) => value + object.velocity[index] * elapsedYears)
    const fields: Array<[string, string]> = [
      ['Object category', 'Star'],
      ['Position source', object.coordinateBasis],
      ['Barycentric ICRF X (ly)', formatLightYears(x)],
      ['Barycentric ICRF Y (ly)', formatLightYears(y)],
      ['Barycentric ICRF Z (ly)', formatLightYears(z)],
      ['Gaia DR3 source ID', 'Not applicable: Sol is not a Gaia source'],
    ]
    if (projectionEpoch.value !== undefined) {
      fields.splice(2, 0, ['Displayed epoch', `J${projectionEpoch.value.toFixed(1)} (constant-velocity projection from J2016.0)`])
    }
    return fields
  }
  const distanceParsecs = 1000 / object.parallax
  const preferredName = atlas.state.permanentLabels.labelsBySourceId[object.sourceId]
  const fields: Array<[string, string]> = [
    ['Gaia source ID', object.sourceId],
    ['RA (deg)', formatMeasurement(object.ra)],
    ['Dec (deg)', formatMeasurement(object.dec)],
    ['Parallax (mas)', formatMeasurement(object.parallax)],
    ['Display distance (ly)', formatLightYears(distanceParsecs)],
  ]
  if (preferredName && object.hostNames && object.hostNames !== preferredName) fields.unshift(['NASA host identifier(s)', object.hostNames])
  if (object.parallaxError !== undefined && Number.isFinite(object.parallaxError)) fields.push(['Parallax uncertainty (mas)', formatMeasurement(object.parallaxError)])
  if (object.magnitude !== undefined && Number.isFinite(object.magnitude)) {
    fields.push(['Mean G magnitude', formatMeasurement(object.magnitude)])
    fields.push(['Display absolute G magnitude', formatMeasurement(object.magnitude - 5 * (Math.log10(distanceParsecs) - 1))])
  }
  if (object.bpRp !== undefined && Number.isFinite(object.bpRp)) fields.push(['BP−RP color index (mag)', formatMeasurement(object.bpRp)])
  if (!preferredName && object.hostNames) fields.push(['NASA host identifier(s)', object.hostNames])
  if (object.sourceCategory) fields.push(['Catalog category', object.sourceCategory])
  if (object.planetCount !== undefined && Number.isFinite(object.planetCount)) fields.push(['Confirmed planets', String(object.planetCount)])
  if (object.planetNames) fields.push(['Planet name(s)', object.planetNames])
  if (object.discoveryMethods) fields.push(['Discovery method(s)', object.discoveryMethods])
  if (object.knownSystemDiameterAu !== undefined && Number.isFinite(object.knownSystemDiameterAu)) fields.push(['Known planetary-system diameter (AU)', formatMeasurement(object.knownSystemDiameterAu)])
  if (object.knownSystemDiameterLightSeconds !== undefined && Number.isFinite(object.knownSystemDiameterLightSeconds)) fields.push(['Known planetary-system diameter (light-seconds)', formatMeasurement(object.knownSystemDiameterLightSeconds)])
  if (object.evidence) fields.push(['Evidence', object.evidence])
  if (object.nssTables) fields.push(['Gaia DR3 NSS solution table(s)', object.nssTables])
  if (object.duplicatedSource) fields.push(['Gaia quality flag', 'Duplicated source'])
  if (object.ruwe !== undefined && Number.isFinite(object.ruwe)) fields.push(['RUWE', formatMeasurement(object.ruwe)])
  if (projectionEpoch.value !== undefined) {
    fields.push(['Displayed epoch', `J${projectionEpoch.value.toFixed(1)} (constant-velocity projection from J2016.0)`])
    fields.push(['6D projection inputs', hasMeasuredSixDimensionalState(object) ? `Measured Gaia proper motion and ${object.radialVelocitySource ?? 'Gaia DR3'} radial velocity available` : 'Unavailable: this source is excluded from projected rendering'])
    if (object.radialVelocitySource && object.radialVelocitySource !== 'Gaia DR3') {
      fields.push(['Radial-velocity source', object.radialVelocitySource])
      if (object.radialVelocityQuality) fields.push(['Radial-velocity quality', object.radialVelocityQuality])
      if (object.radialVelocityBibliographyCode) fields.push(['Radial-velocity bibliography', object.radialVelocityBibliographyCode])
    }
    const projected = propagateGaiaPosition(object, projectionEpoch.value)
    if (projected) {
      const current = cartesianPosition(object)
      const displacementAu = cartesianDistance(current, projected) * 206_264.806_247_096_36
      fields.push(['Projected barycentric X (ly)', formatLightYears(projected[0])])
      fields.push(['Projected barycentric Y (ly)', formatLightYears(projected[1])])
      fields.push(['Projected barycentric Z (ly)', formatLightYears(projected[2])])
      fields.push(['J2016.0 to projected displacement (AU)', formatMeasurement(displacementAu)])
      const uncertainty = projectedPositionUncertaintyParsecs(object, projectionEpoch.value)
      fields.push(['Astrometric covariance', astrometricCovariance(object) ? 'Published Gaia five-parameter covariance is valid' : 'Unavailable or invalid'])
      fields.push(['Projected RSS Cartesian uncertainty (ly)', uncertainty === undefined ? 'Unavailable or invalid' : formatLightYears(uncertainty)])
    }
  }
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
      ['Overall distance (ly)', formatMeasurement(lightYears)],
      ['Overall distance (light-megaseconds)', formatMeasurement(lightYears * LIGHT_MEGASECONDS_PER_LIGHT_YEAR)],
    ] as Array<[string, string]>,
    hops: endpoints.slice(1).map((endpoint, index) => {
      const hopParsecs = cartesianDistance(positions[index], positions[index + 1])
      return [
        `Hop ${index + 1}: ${sourceDisplayName(endpoints[index])} → ${sourceDisplayName(endpoint)}`,
        `${formatLightYears(hopParsecs)} ly`,
      ] as [string, string]
    }),
  }
}

function positionForObject(object: AtlasObject): [number, number, number] {
  if (isNonGaiaStar(object)) {
    if (projectionEpoch.value === undefined) return object.position
    const elapsedYears = projectionEpoch.value - GAIA_REFERENCE_EPOCH
    return object.position.map((value, index) => value + object.velocity[index] * elapsedYears) as [number, number, number]
  }
  if (projectionEpoch.value !== undefined) {
    const projected = propagateGaiaPosition(object, projectionEpoch.value)
    if (!projected) throw new Error(`Gaia DR3 ${object.sourceId} lacks the measured 6D state required for projected routes.`)
    return [...projected]
  }
  return cartesianPosition(object)
}

function formatHostNames(hostNames: string | undefined) {
  return hostNames?.split('; ').map((name) => formatDisplayName(name)).join('; ')
}

function formatLightYears(parsecs: number) {
  return formatMeasurement(parsecs * LIGHT_YEARS_PER_PARSEC)
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
          :projection-epoch="projectionEpoch"
          :projection-available="atlas.state.activeFocusedCatalog"
          :projected-source-count="projectedSourceCount"
          :projection-rendering="projectionRendering"
          @change-catalog="loadBundledCatalog"
          @toggle-labels="toggleLabels"
          @import-file="importCatalog"
          @retry-labels="refreshLabelCatalog"
          @change-projection-epoch="setProjectionEpoch"
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
          :projection-epoch="projectionEpoch"
          :display-name="sourceDisplayName"
          @select="selectMapObject"
          @focus="focusMapObject"
          @pop-route="popRoute"
          @projection-rendered="finishProjectionRender"
        />
        <p class="scene-hint">
          Drag to orbit · scroll to zoom · double-click a point for its Gaia values
        </p>
      </div>
    </section>
    <footer>
      <span>TRAPPIST-1 is the origin · Gaia axes: ICRS Cartesian X, Y, Z · Sol: JPL Horizons ICRF state · units: light-years</span>
      <a
        href="https://exoplanetarchive.ipac.caltech.edu/"
        target="_blank"
        rel="noreferrer"
      >NASA Exoplanet Archive</a>
    </footer>
  </main>
</template>
