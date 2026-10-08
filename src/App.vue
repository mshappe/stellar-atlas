<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { BUNDLED_CATALOGS, LIGHT_MEGASECONDS_PER_LIGHT_YEAR, LIGHT_YEARS_PER_PARSEC, SOL } from './atlas-data'
import type { AtlasObject, GaiaRow, ParsedCatalog } from './atlas-types'
import AtlasScene from './components/AtlasScene.vue'
import CatalogControls from './components/CatalogControls.vue'
import CatalogSearch from './components/CatalogSearch.vue'
import ReferenceFramePanel from './components/ReferenceFramePanel.vue'
import RoutePanel from './components/RoutePanel.vue'
import SelectionPanel from './components/SelectionPanel.vue'
import { useAtlasState } from './composables/useAtlasState'
import { cartesianDistance, cartesianPosition, formatDisplayName, routeDistanceFromPositions } from './catalog'
import { loadLabelCatalog } from './label-catalog'

const REQUIRED_COLUMNS = ['source_id', 'ra', 'dec', 'parallax'] as const
const atlas = useAtlasState()
const scene = ref<InstanceType<typeof AtlasScene>>()
const importStatus = ref('Loading focused stars…')
const catalogState = ref('Loading focused stars…')
const searchStatus = ref('Searches Gaia DR3 IDs, NASA host and planet identifiers, and configured labels.')
const searchResults = ref<Array<{ object: AtlasObject, name: string, identifiers: string }>>([])
const searchResetId = ref(0)
let catalogLoadId = 0
const labelCatalogReady = loadLabelCatalog(import.meta.env.BASE_URL).then(atlas.setLabelCatalog)

const selectedName = computed(() => atlas.state.selectedObject && sourceDisplayName(atlas.state.selectedObject))
const selectedFields = computed(() => atlas.state.selectedObject ? selectionFields(atlas.state.selectedObject) : [])
const route = computed(() => routeDisplay(atlas.state.measurementEndpoints))
const labelIds = computed(() => atlas.displayedLabelIds())

onMounted(() => {
  void loadBundledCatalog('confirmed-hosts')
})

async function loadBundledCatalog(catalogKey: keyof typeof BUNDLED_CATALOGS) {
  const definition = BUNDLED_CATALOGS[catalogKey]
  const loadId = ++catalogLoadId
  importStatus.value = `Loading ${definition.count.toLocaleString()} ${definition.label}…`
  try {
    await labelCatalogReady
    const response = await fetch(`${import.meta.env.BASE_URL}${definition.file}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const parsed = parseGaiaCsv(await response.text())
    if (loadId !== catalogLoadId) return
    atlas.activateCatalog(parsed, definition.focusedCatalog)
    if (atlas.state.activeCatalog?.rows.length !== definition.count) {
      throw new Error(`Expected ${definition.count.toLocaleString()} catalog rows but received ${atlas.state.activeCatalog?.rows.length.toLocaleString() ?? '0'}.`)
    }
    resetSearch()
    updateCatalogStatus()
  } catch (error) {
    if (loadId !== catalogLoadId) return
    catalogState.value = 'Catalog unavailable'
    importStatus.value = `The bundled Gaia DR3 volume could not be loaded: ${error instanceof Error ? error.message : 'unknown error'}.`
  }
}

async function importCatalog(file: File) {
  catalogLoadId += 1
  try {
    await labelCatalogReady
    atlas.activateCatalog(parseGaiaCsv(await file.text()), false)
    resetSearch()
    updateCatalogStatus()
  } catch (error) {
    importStatus.value = error instanceof Error ? error.message : 'The catalog could not be read.'
  }
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
  scene.value?.focusObject(object)
}

function selectMapObject(object: AtlasObject) {
  atlas.selectMapObject(object)
}

function focusMapObject(object: AtlasObject) {
  atlas.locateObject(object)
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
  if (preferredName && object.hostNames !== preferredName) fields.unshift(['NASA host identifier(s)', object.hostNames ?? ''])
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

function parseGaiaCsv(text: string): ParsedCatalog {
  const matrix = readCsv(text)
  if (matrix.length < 2) throw new Error('The file has no data rows.')
  const header = matrix[0].map((value) => value.trim().toLowerCase().replace(/^\uFEFF/, ''))
  const missing = REQUIRED_COLUMNS.filter((column) => !header.includes(column))
  if (missing.length) throw new Error(`Missing required Gaia DR3 column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`)
  const column = (name: string) => header.indexOf(name)
  const optional = (name: string, values: string[]) => {
    const index = column(name)
    return index === -1 || !values[index].trim() ? undefined : Number(values[index])
  }
  const optionalText = (name: string, values: string[]) => {
    const index = column(name)
    return index === -1 || !values[index].trim() ? undefined : values[index].trim()
  }
  const rows: GaiaRow[] = []
  let rejected = 0
  for (const values of matrix.slice(1)) {
    if (values.every((value) => !value.trim())) continue
    const row: GaiaRow = {
      sourceId: values[column('source_id')]?.trim(),
      ra: Number(values[column('ra')]),
      dec: Number(values[column('dec')]),
      parallax: Number(values[column('parallax')]),
      parallaxError: optional('parallax_error', values),
      raError: optional('ra_error', values),
      decError: optional('dec_error', values),
      magnitude: optional('phot_g_mean_mag', values),
      bpRp: optional('bp_rp', values),
      hostNames: optionalText('host_names', values),
      planetCount: optional('planet_count', values),
      planetNames: optionalText('planet_names', values),
      discoveryMethods: optionalText('discovery_methods', values),
      evidence: optionalText('evidence', values),
      knownSystemDiameterAu: optional('known_system_diameter_au', values),
      knownSystemDiameterLightSeconds: optional('known_system_diameter_light_seconds', values),
      sourceCategory: optionalText('source_category', values),
    }
    if (!row.sourceId || !Number.isFinite(row.ra) || !Number.isFinite(row.dec) || !Number.isFinite(row.parallax) || row.parallax <= 0) {
      rejected += 1
      continue
    }
    rows.push(row)
  }
  if (!rows.length) throw new Error('No renderable rows found. Positive, finite parallax is required for this view.')
  return { rows, rejected, outOfRange: 0 }
}

function readCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      row.push(value)
      value = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(value)
      rows.push(row)
      row = []
      value = ''
    } else {
      value += character
    }
  }
  if (quoted) throw new Error('The CSV contains an unterminated quoted value.')
  if (value || row.length) {
    row.push(value)
    rows.push(row)
  }
  return rows
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
        <RoutePanel
          v-bind="route"
          :has-endpoints="Boolean(atlas.state.measurementEndpoints.length)"
          @clear="clearRoute"
        />
        <CatalogControls
          :focused-catalog="atlas.state.activeFocusedCatalog"
          :hide-unlabeled-stars="atlas.state.hideUnlabeledStars"
          :import-status="importStatus"
          @change-catalog="(focused) => loadBundledCatalog(focused ? 'confirmed-hosts' : 'all-stars')"
          @toggle-labels="toggleLabels"
          @import-file="importCatalog"
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
