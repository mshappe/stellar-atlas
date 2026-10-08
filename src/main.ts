import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import {
  appendSelectionEndpoint,
  cartesianDistance,
  cartesianPosition,
  filterLabeledRows,
  formatDisplayName,
  isWithinCartesianRadius,
  popSelectionEndpoint,
  relativeCartesianPosition,
  routeDistanceFromPositions,
  searchCatalogRows,
  selectedAlternativeLabelIds,
} from './catalog'

type GaiaRow = {
  sourceId: string
  ra: number
  dec: number
  parallax: number
  parallaxError?: number
  raError?: number
  decError?: number
  magnitude?: number
  bpRp?: number
  hostNames?: string
  planetCount?: number
  planetNames?: string
  discoveryMethods?: string
  evidence?: string
  knownSystemDiameterAu?: number
  knownSystemDiameterLightSeconds?: number
  sourceCategory?: string
}

function renderSelectedObject(object: AtlasObject) {
  if (isNonGaiaStar(object)) {
    renderSolStar(object)
    return
  }
  renderSelectedSource(object)
}

function renderSolStar(star: NonGaiaStar) {
  selectionPanel.hidden = false
  selectionName.textContent = star.name
  const [x, y, z] = star.position
  const fields: Array<[string, string]> = [
    ['Object category', 'Star'],
    ['Position source', star.coordinateBasis],
    ['Barycentric ICRS X (pc)', String(x)],
    ['Barycentric ICRS Y (pc)', String(y)],
    ['Barycentric ICRS Z (pc)', String(z)],
    ['Gaia DR3 source ID', 'Not applicable: Sol is not a Gaia source'],
  ]
  selectionDetails.replaceChildren(...fields.map(([term, detail]) => {
    const container = document.createElement('div')
    const label = document.createElement('dt')
    const value = document.createElement('dd')
    label.textContent = term
    value.textContent = detail
    container.append(label, value)
    return container
  }))
}

type ParsedCatalog = {
  rows: GaiaRow[]
  rejected: number
  outOfRange: number
}

type NonGaiaStar = {
  sourceId: 'sol'
  name: 'Sol'
  position: [number, number, number]
  coordinateBasis: 'JPL Horizons barycentric ICRS position at J2016.0'
}

type AtlasObject = GaiaRow | NonGaiaStar

const SOL: NonGaiaStar = {
  sourceId: 'sol',
  name: 'Sol',
  position: [1.812038087014733e-8, 6.814301406306658e-9, -7.81411830683232e-10],
  coordinateBasis: 'JPL Horizons barycentric ICRS position at J2016.0',
}

const REQUIRED_COLUMNS = ['source_id', 'ra', 'dec', 'parallax'] as const
const LIGHT_YEARS_PER_PARSEC = 3.2615637771674333
const LIGHT_MEGASECONDS_PER_LIGHT_YEAR = 31.5576
const MAX_DISTANCE_LIGHT_YEARS = 300
const MAX_DISTANCE_PARSECS = MAX_DISTANCE_LIGHT_YEARS / LIGHT_YEARS_PER_PARSEC
const COLOR_STOPS: Array<[number, [number, number, number]]> = [
  [-0.5, [0.55, 0.7, 1]],
  [0, [0.85, 0.9, 1]],
  [0.6, [1, 0.95, 0.8]],
  [1.2, [1, 0.72, 0.45]],
  [2.2, [1, 0.43, 0.25]],
  [4, [0.74, 0.13, 0.12]],
]
const PROMINENT_STAR_LABELS: Record<string, string> = {
  '2452378776434477184': 'Tau Ceti',
  '5853498713190525696': 'Proxima Centauri',
  '5164707970261890560': 'Epsilon Eridani',
  '4472832130942575872': "Barnard's Star",
  '2635476908753563008': 'TRAPPIST-1',
  '704967037090946688': '55 Cancri',
  '2835207319109249920': '51 Pegasi',
  '6322070093095493504': 'Gliese 581',
  '1208695640675619584': 'Ross 508',
  '2371032916186181760': 'LHS 1140',
  '4810594479418041856': "Kapteyn's Star",
  '4429785739602747392': "Unukalhai (Serpent's Head)",
}
const LABELED_SOURCE_IDS = new Set(Object.keys(PROMINENT_STAR_LABELS))
const INITIAL_ORIGIN_SOURCE_ID = '2635476908753563008'
const BUNDLED_CATALOGS = {
  'confirmed-hosts': {
    file: 'gaia-dr3-confirmed-exoplanet-hosts-trappist-1-300ly.csv',
    count: 1_000,
    focusedCatalog: true,
    label: 'focused stars',
  },
  'all-stars': {
    file: 'gaia-dr3-trappist-1-300ly.csv',
    count: 443_660,
    focusedCatalog: false,
    label: 'Gaia DR3 sources',
  },
} as const

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="atlas">
    <header>
      <div>
        <p class="eyebrow">Gaia DR3 spatial viewer</p>
        <h1>Stellar Atlas</h1>
      </div>
      <p class="catalog-state" id="catalog-state">Loading focused stars…</p>
    </header>
    <section class="workspace" aria-label="3D stellar visualization">
      <aside class="sidebar">
        <section id="selection-panel" hidden>
          <p class="selection-heading">Selected source</p>
          <h2 class="source-name" id="selection-name"></h2>
          <dl id="selection-details"></dl>
        </section>
        <section id="measurement-panel">
          <h2>Point-to-point distance</h2>
          <p class="status" id="measurement-status">Select a first star, then a second star.</p>
          <dl id="measurement-details"></dl>
          <details id="route-hops" hidden>
            <summary>Show individual hops</summary>
            <dl id="route-hop-details"></dl>
          </details>
          <button class="measure-clear" id="measurement-clear" type="button" hidden>Clear route</button>
        </section>
        <section>
          <h2>Catalog input</h2>
          <p>The default map contains confirmed exoplanet hosts plus explicitly identified named reference stars. Switch to the complete Gaia volume whenever you need another comparison or candidate.</p>
          <label class="catalog-control" for="catalog-mode">
            <span>Bundled map</span>
            <select id="catalog-mode">
              <option value="confirmed-hosts">Focused stars (1,000)</option>
              <option value="all-stars">All Gaia DR3 sources (443,660)</option>
            </select>
          </label>
          <button class="label-toggle" id="label-toggle" type="button">Hide unlabeled stars</button>
          <label class="upload-control" for="catalog-file">
            <span>Choose Gaia DR3 CSV</span>
            <input id="catalog-file" type="file" accept=".csv,text/csv" />
          </label>
          <p class="status" id="import-status" role="status">Loading focused stars…</p>
        </section>
        <section>
          <h2>Find a star</h2>
          <form class="search-form" id="catalog-search-form">
            <label for="catalog-search">Known catalog identifier</label>
            <div>
              <input id="catalog-search" type="search" placeholder="e.g. 1069" autocomplete="off" />
              <button type="submit">Find</button>
            </div>
          </form>
          <p class="status" id="catalog-search-status" role="status">Searches Gaia DR3 IDs, NASA host and planet identifiers, and configured labels.</p>
          <ul class="search-results" id="catalog-search-results" hidden></ul>
        </section>
        <section>
          <h2>Reference frame</h2>
          <dl>
            <div><dt>Catalog</dt><dd>Gaia DR3</dd></div>
            <div><dt>Frame</dt><dd>ICRS</dd></div>
            <div><dt>Astrometry epoch</dt><dd>J2016.0</dd></div>
            <div><dt>Distance display</dt><dd>1 / parallax</dd></div>
            <div><dt>Point color</dt><dd>Gaia BP−RP index</dd></div>
            <div><dt>Point size</dt><dd>Absolute G magnitude</dd></div>
            <div><dt>Map radius</dt><dd>300 ly / ${MAX_DISTANCE_PARSECS.toFixed(5)} pc</dd></div>
          </dl>
          <p class="caveat">The cyan wire sphere marks the exact 300-ly volume around TRAPPIST-1. Colors are a visual mapping of measured BP−RP, and size is an extinction-unadjusted luminosity proxy—not physical radius or a spectral-type classification.</p>
        </section>
      </aside>
      <div class="scene-shell">
        <div id="scene" aria-label="Interactive three-dimensional stellar field"></div>
        <p class="scene-hint">Drag to orbit · scroll to zoom · double-click a point for its Gaia values</p>
      </div>
    </section>
    <footer>
      <span>TRAPPIST-1 is the origin · axes: ICRS Cartesian X, Y, Z · units: parsecs</span>
      <a href="https://exoplanetarchive.ipac.caltech.edu/" target="_blank" rel="noreferrer">NASA Exoplanet Archive</a>
    </footer>
  </main>
`

const sceneContainer = document.querySelector<HTMLDivElement>('#scene')!
const fileInput = document.querySelector<HTMLInputElement>('#catalog-file')!
const catalogMode = document.querySelector<HTMLSelectElement>('#catalog-mode')!
const labelToggle = document.querySelector<HTMLButtonElement>('#label-toggle')!
const catalogSearchForm = document.querySelector<HTMLFormElement>('#catalog-search-form')!
const catalogSearch = document.querySelector<HTMLInputElement>('#catalog-search')!
const catalogSearchStatus = document.querySelector<HTMLParagraphElement>('#catalog-search-status')!
const catalogSearchResults = document.querySelector<HTMLUListElement>('#catalog-search-results')!
const importStatus = document.querySelector<HTMLParagraphElement>('#import-status')!
const catalogState = document.querySelector<HTMLParagraphElement>('#catalog-state')!
const selectionPanel = document.querySelector<HTMLElement>('#selection-panel')!
const selectionName = document.querySelector<HTMLHeadingElement>('#selection-name')!
const selectionDetails = document.querySelector<HTMLDListElement>('#selection-details')!
const measurementStatus = document.querySelector<HTMLParagraphElement>('#measurement-status')!
const measurementDetails = document.querySelector<HTMLDListElement>('#measurement-details')!
const routeHops = document.querySelector<HTMLDetailsElement>('#route-hops')!
const routeHopDetails = document.querySelector<HTMLDListElement>('#route-hop-details')!
const measurementClear = document.querySelector<HTMLButtonElement>('#measurement-clear')!

const scene = new THREE.Scene()
scene.background = new THREE.Color('#07101d')
const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1e12)
camera.position.set(10, 10, 10)
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
sceneContainer.append(renderer.domElement)
const routeOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
routeOverlay.classList.add('route-overlay')
const routePath = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
routePath.classList.add('route-path')
const routeMarkers = document.createElementNS('http://www.w3.org/2000/svg', 'g')
routeOverlay.append(routePath, routeMarkers)
sceneContainer.append(routeOverlay)
const labelRenderer = new CSS2DRenderer()
labelRenderer.domElement.className = 'label-layer'
sceneContainer.append(labelRenderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.minDistance = 0.01
controls.maxDistance = 1e12

const axes = new THREE.AxesHelper(1)
scene.add(axes)
const volumeBoundary = new THREE.Mesh(
  new THREE.SphereGeometry(MAX_DISTANCE_PARSECS, 48, 32),
  new THREE.MeshBasicMaterial({ color: '#3f99c3', wireframe: true, transparent: true, opacity: 0.18 }),
)
scene.add(volumeBoundary)
const solMarker = new THREE.Points(
  new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)),
  new THREE.PointsMaterial({ color: '#ffd56a', size: 8, sizeAttenuation: false }),
)
scene.add(solMarker)
const solLabelAnchor = document.createElement('div')
solLabelAnchor.className = 'star-label-anchor sol-label-anchor'
const solLabelElement = document.createElement('span')
solLabelElement.className = 'star-label sol-label'
solLabelElement.textContent = SOL.name
solLabelElement.addEventListener('click', (event) => {
  event.stopPropagation()
  showSelection(SOL)
})
solLabelElement.addEventListener('dblclick', (event) => {
  event.preventDefault()
  event.stopPropagation()
  showSelection(SOL)
  focusOnObject(SOL)
})
solLabelAnchor.append(solLabelElement)
const solLabel = new CSS2DObject(solLabelAnchor)
solLabel.center.set(0, 0)
scene.add(solLabel)
const starLabels = new THREE.Group()
scene.add(starLabels)
const raycaster = new THREE.Raycaster()
raycaster.params.Points!.threshold = 0.25
const pointer = new THREE.Vector2()
let stars: THREE.Points | undefined
let catalogRows: GaiaRow[] = []
let catalogLoadId = 0
let measurementEndpoints: AtlasObject[] = []
let activeCatalog: ParsedCatalog | undefined
let activeFocusedCatalog = false
let hideUnlabeledStars = false
let renderedCatalog: ParsedCatalog | undefined
let routePositions: THREE.Vector3[] = []
let selectedOrigin: AtlasObject = SOL
const knownCatalogIdentifiers: Record<string, string[]> = {}
let matchedSearchSourceIds = new Set<string>()
let alternativeLabelIds = new Set<string>()

function resizeRenderer() {
  const { clientWidth: width, clientHeight: height } = sceneContainer
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height, false)
  routeOverlay.setAttribute('viewBox', `0 0 ${width} ${height}`)
  labelRenderer.setSize(width, height)
}

new ResizeObserver(resizeRenderer).observe(sceneContainer)

function render() {
  controls.update()
  renderer.render(scene, camera)
  updateRouteOverlay()
  labelRenderer.render(scene, camera)
  requestAnimationFrame(render)
}

render()

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0]
  if (!file) return
  catalogLoadId += 1

  try {
    const parsed = parseGaiaCsv(await file.text())
    registerKnownCatalogIdentifiers(parsed.rows)
    setInitialOrigin(parsed)
    activeCatalog = filterCatalogToSelectedOrigin(parsed)
    activeFocusedCatalog = false
    clearCatalogSearch()
    renderActiveCatalog()
  } catch (error) {
    importStatus.textContent = error instanceof Error ? error.message : 'The catalog could not be read.'
  }
})

measurementClear.addEventListener('click', clearMeasurement)

catalogMode.addEventListener('change', () => {
  void loadBundledCatalog(catalogMode.value === 'all-stars' ? 'all-stars' : 'confirmed-hosts')
})

labelToggle.addEventListener('click', () => {
  hideUnlabeledStars = !hideUnlabeledStars
  labelToggle.textContent = hideUnlabeledStars ? 'Show unlabeled stars' : 'Hide unlabeled stars'
  renderActiveCatalog()
})

catalogSearchForm.addEventListener('submit', (event) => {
  event.preventDefault()
  renderCatalogSearch()
})

catalogSearch.addEventListener('input', () => {
  catalogSearchResults.replaceChildren()
  catalogSearchResults.hidden = true
  catalogSearchStatus.textContent = 'Press Find to search the active catalog.'
})

void loadBundledCatalog('confirmed-hosts')

async function loadBundledCatalog(catalogKey: keyof typeof BUNDLED_CATALOGS) {
  const catalog = BUNDLED_CATALOGS[catalogKey]
  const loadId = ++catalogLoadId
  importStatus.textContent = `Loading ${catalog.count.toLocaleString()} ${catalog.label}…`
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${catalog.file}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const parsed = parseGaiaCsv(await response.text())
    registerKnownCatalogIdentifiers(parsed.rows)
    if (loadId !== catalogLoadId) return
    setInitialOrigin(parsed)
    const filtered = filterCatalogToSelectedOrigin(parsed)
    if (filtered.rows.length !== catalog.count) {
      throw new Error(`Expected ${catalog.count.toLocaleString()} catalog rows but received ${filtered.rows.length.toLocaleString()}.`)
    }
    activeCatalog = filtered
    activeFocusedCatalog = catalog.focusedCatalog
    clearCatalogSearch()
    renderActiveCatalog()
  } catch (error) {
    if (loadId !== catalogLoadId) return
    catalogState.textContent = 'Catalog unavailable'
    importStatus.textContent = `The bundled Gaia DR3 volume could not be loaded: ${error instanceof Error ? error.message : 'unknown error'}.`
  }
}

function renderActiveCatalog() {
  if (!activeCatalog) return

  updateSolRenderPosition()
  const labeledSourceIds = displayedLabelIds()
  const visibleRows = hideUnlabeledStars
    ? filterLabeledRows(activeCatalog.rows, labeledSourceIds)
    : activeCatalog.rows
  catalogRows = activeCatalog.rows

  if (renderedCatalog !== activeCatalog) {
    displayCatalog(activeCatalog, activeFocusedCatalog)
    renderedCatalog = activeCatalog
  }

  setPointVisibility(activeCatalog.rows, labeledSourceIds)

  if (!visibleRows.length) {
    catalogState.textContent = 'No labeled stars in this catalog'
    importStatus.textContent = 'No source in the active catalog has a configured evidence-backed label.'
    return
  }

  const scope = activeFocusedCatalog ? 'focused Gaia DR3 stars' : 'Gaia DR3 sources'
  importStatus.textContent = hideUnlabeledStars
    ? `${visibleRows.length.toLocaleString()} labeled ${scope} shown.`
    : `${visibleRows.length.toLocaleString()} ${scope} shown.`
  catalogState.textContent = activeFocusedCatalog
    ? `${visibleRows.length.toLocaleString()} focused stars · 300 ly`
    : `${visibleRows.length.toLocaleString()} Gaia DR3 sources · 300 ly`
}

function clearCatalogSearch() {
  matchedSearchSourceIds = new Set()
  alternativeLabelIds = new Set()
  catalogSearch.value = ''
  catalogSearchResults.replaceChildren()
  catalogSearchResults.hidden = true
  catalogSearchStatus.textContent = 'Searches Gaia DR3 IDs, NASA host and planet identifiers, and configured labels.'
}

function renderCatalogSearch() {
  const query = catalogSearch.value.trim()
  if (!query) {
    catalogSearchResults.replaceChildren()
    catalogSearchResults.hidden = true
    catalogSearchStatus.textContent = 'Enter at least one character to search the active catalog.'
    return
  }
  if (!activeCatalog) {
    catalogSearchStatus.textContent = 'The active catalog is still loading.'
    return
  }

  const rows = searchCatalogRows(activeCatalog.rows, query, PROMINENT_STAR_LABELS, knownCatalogIdentifiers)
  setSearchMatchLabels(rows)
  const normalizedQuery = query.toLowerCase()
  const results: AtlasObject[] = [
    ...(SOL.name.toLowerCase().includes(normalizedQuery) || SOL.sourceId.includes(normalizedQuery) ? [SOL] : []),
    ...rows,
  ]
  catalogSearchResults.replaceChildren(...results.map((object) => {
    const item = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = sourceDisplayName(object)
    button.addEventListener('click', () => {
      collapseSearchMatchLabels(object)
      renderSelectedObject(object)
      focusOnObject(object)
    })
    const identifiers = document.createElement('span')
    identifiers.textContent = searchableIdentifiers(object)
    item.append(button, identifiers)
    return item
  }))
  catalogSearchResults.hidden = !results.length
  catalogSearchStatus.textContent = results.length
    ? `${results.length} matching ${results.length === 1 ? 'star' : 'stars'} shown${rows.length === 25 ? '; refine the search to narrow results.' : '.'}`
    : `No known catalog identifiers contain “${query}”.`
}

function displayedLabelIds() {
  return new Set([...LABELED_SOURCE_IDS, ...alternativeLabelIds])
}

function setSearchMatchLabels(rows: GaiaRow[]) {
  matchedSearchSourceIds = new Set(rows.map((row) => row.sourceId))
  alternativeLabelIds = new Set([...matchedSearchSourceIds].filter((sourceId) => !LABELED_SOURCE_IDS.has(sourceId)))
  refreshSearchLabels()
}

function collapseSearchMatchLabels(object: AtlasObject) {
  if (isNonGaiaStar(object) || !matchedSearchSourceIds.has(object.sourceId)) return
  matchedSearchSourceIds = new Set([object.sourceId])
  alternativeLabelIds = selectedAlternativeLabelIds(object.sourceId, LABELED_SOURCE_IDS)
  refreshSearchLabels()
}

function refreshSearchLabels() {
  renderStarLabels()
  renderActiveCatalog()
}

function searchableIdentifiers(object: AtlasObject) {
  if (isNonGaiaStar(object)) return `JPL Horizons · ${object.coordinateBasis}`
  return [...new Set([
    `Gaia DR3 ${object.sourceId}`,
    object.hostNames,
    object.planetNames,
    PROMINENT_STAR_LABELS[object.sourceId],
    ...(knownCatalogIdentifiers[object.sourceId] ?? []),
  ].filter(Boolean))].join(' · ')
}

function registerKnownCatalogIdentifiers(rows: GaiaRow[]) {
  rows.forEach((row) => {
    const identifiers = [row.hostNames, row.planetNames].filter((identifier): identifier is string => Boolean(identifier))
    if (identifiers.length) knownCatalogIdentifiers[row.sourceId] = identifiers
  })
}

function setInitialOrigin(catalog: ParsedCatalog) {
  const origin = catalog.rows.find((row) => row.sourceId === INITIAL_ORIGIN_SOURCE_ID)
  if (!origin) {
    throw new Error('The active catalog must contain TRAPPIST-1 (Gaia DR3 2635476908753563008), the fixed map origin.')
  }
  selectedOrigin = origin
}

renderer.domElement.addEventListener('click', (event) => {
  const row = pickStar(event)
  if (row) showSelection(row)
})

renderer.domElement.addEventListener('dblclick', (event) => {
  const row = pickStar(event)
  if (!row) return
  showSelection(row)
  focusOnObject(row)
})

sceneContainer.addEventListener('contextmenu', (event) => {
  event.preventDefault()
  if (!measurementEndpoints.length) return

  measurementEndpoints = popSelectionEndpoint(measurementEndpoints)
  renderMeasurement()
  const selectedRow = measurementEndpoints.at(-1)
  if (selectedRow) {
    renderSelectedObject(selectedRow)
  } else {
    clearSelectedSource()
  }
})

function pickStar(event: MouseEvent) {
  const bounds = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const intersection = stars ? raycaster.intersectObject(stars)[0] : undefined
  const row = intersection?.index === undefined ? undefined : catalogRows[intersection.index]
  if (row && (!hideUnlabeledStars || displayedLabelIds().has(row.sourceId))) return row
  return raycaster.intersectObject(solMarker)[0] ? SOL : undefined
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
  const outOfRange = 0
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

    if (
      !row.sourceId ||
      !Number.isFinite(row.ra) ||
      !Number.isFinite(row.dec) ||
      !Number.isFinite(row.parallax) ||
      row.parallax <= 0
    ) {
      rejected += 1
      continue
    }
    rows.push(row)
  }

  if (!rows.length) throw new Error('No renderable rows found. Positive, finite parallax is required for this view.')
  return { rows, rejected, outOfRange }
}

function filterCatalogToSelectedOrigin(catalog: ParsedCatalog): ParsedCatalog {
  const center = positionFromObject(selectedOrigin).toArray() as [number, number, number]
  const rows = catalog.rows.filter((row) => isWithinCartesianRadius(
    positionFromRow(row).toArray() as [number, number, number],
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

function readCsv(text: string): string[][] {
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

function displayCatalog({ rows }: ParsedCatalog, focusedCatalog: boolean) {
  clearRenderedCatalog()
  const positions = new Float32Array(rows.length * 3)
  const colors = new Float32Array(rows.length * 3)
  const pointSizes = new Float32Array(rows.length)
  const pointVisibility = new Float32Array(rows.length)
  let farthest = 0

  rows.forEach((row, index) => {
    const position = relativePositionFromObject(row)
    const { x, y, z } = position
    const barycentricDistanceParsecs = positionFromRow(row).length()
    positions.set([x, y, z], index * 3)
    pointVisibility[index] = 1
    farthest = Math.max(farthest, position.length())

    writeColorFromBpRp(row.bpRp, colors, index * 3)
    pointSizes[index] = pointSizeFromAbsoluteMagnitude(row.magnitude, barycentricDistanceParsecs)
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('pointSize', new THREE.BufferAttribute(pointSizes, 1))
  geometry.setAttribute('pointVisibility', new THREE.BufferAttribute(pointVisibility, 1))
  geometry.computeBoundingSphere()
  stars = new THREE.Points(geometry, new THREE.ShaderMaterial({
    vertexShader: `
      attribute vec3 color;
      attribute float pointSize;
      attribute float pointVisibility;
      varying vec3 pointColor;

      void main() {
        pointColor = color;
        vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = pointVisibility > 0.5
          ? clamp(pointSize * (300.0 / max(0.001, -modelViewPosition.z)), 6.0, 18.0)
          : 0.0;
        gl_Position = projectionMatrix * modelViewPosition;
      }
    `,
    fragmentShader: `
      varying vec3 pointColor;

      void main() {
        if (distance(gl_PointCoord, vec2(0.5)) > 0.5) discard;
        gl_FragColor = vec4(pointColor, 1.0);
      }
    `,
    depthWrite: false,
  }))
  scene.add(stars)
  renderStarLabels()

  const framingDistance = Math.max(MAX_DISTANCE_PARSECS * 2.2, farthest * 2.2, 2)
  camera.position.set(framingDistance, framingDistance * 0.65, framingDistance * 0.45)
  camera.near = Math.max(farthest / 1e7, 0.00001)
  camera.far = Math.max(farthest * 10, 100)
  camera.updateProjectionMatrix()
  controls.target.set(0, 0, 0)
  controls.update()
  axes.scale.setScalar(Math.max(MAX_DISTANCE_PARSECS * 0.1, farthest * 0.1, 1))
  catalogState.textContent = focusedCatalog
    ? `${rows.length.toLocaleString()} focused stars · 300 ly`
    : `${rows.length.toLocaleString()} Gaia DR3 sources · 300 ly`
}

function setPointVisibility(rows: GaiaRow[], labeledSourceIds: ReadonlySet<string>) {
  if (!stars) return
  const attribute = stars.geometry.getAttribute('pointVisibility') as THREE.BufferAttribute
  rows.forEach((row, index) => {
    attribute.setX(index, !hideUnlabeledStars || labeledSourceIds.has(row.sourceId) ? 1 : 0)
  })
  attribute.needsUpdate = true
}

function clearRenderedCatalog() {
  if (!stars) return
  scene.remove(stars)
  stars.geometry.dispose()
  ;(stars.material as THREE.Material).dispose()
  stars = undefined
  starLabels.clear()
}

function renderStarLabels() {
  starLabels.clear()
  for (const row of catalogRows) {
    const officialName = PROMINENT_STAR_LABELS[row.sourceId]
    const isAlternative = alternativeLabelIds.has(row.sourceId)
    const name = officialName ?? (isAlternative ? sourceDisplayName(row) : undefined)
    if (!name) continue
    addStarLabel(row, name, isAlternative)
  }
}

function addStarLabel(row: GaiaRow, name: string, isAlternative: boolean) {
  const anchor = document.createElement('div')
  anchor.className = 'star-label-anchor'
  const element = document.createElement('span')
  element.className = isAlternative ? 'star-label alternative-star-label' : 'star-label'
  element.textContent = name
  element.addEventListener('click', (event) => {
    event.stopPropagation()
    collapseSearchMatchLabels(row)
    showSelection(row)
  })
  element.addEventListener('dblclick', (event) => {
    event.preventDefault()
    event.stopPropagation()
    collapseSearchMatchLabels(row)
    showSelection(row)
    focusOnObject(row)
  })
  anchor.append(element)
  const label = new CSS2DObject(anchor)
  label.center.set(0, 0)
  label.position.copy(relativePositionFromObject(row))
  starLabels.add(label)
}

function isNonGaiaStar(object: AtlasObject): object is NonGaiaStar {
  return 'position' in object
}

function positionFromObject(object: AtlasObject) {
  return isNonGaiaStar(object) ? new THREE.Vector3(...object.position) : positionFromRow(object)
}

function relativePositionFromAbsolute(position: THREE.Vector3) {
  return position.clone().sub(positionFromObject(selectedOrigin))
}

function relativePositionFromObject(object: AtlasObject) {
  return new THREE.Vector3(...relativeCartesianPosition(
    positionFromObject(object).toArray() as [number, number, number],
    positionFromObject(selectedOrigin).toArray() as [number, number, number],
  ))
}

function updateSolRenderPosition() {
  const solPosition = relativePositionFromObject(SOL)
  solMarker.position.copy(solPosition)
  solLabel.position.copy(solPosition)
}

function focusOnObject(object: AtlasObject) {
  const target = relativePositionFromObject(object)
  const cameraOffset = camera.position.clone().sub(controls.target)
  controls.target.copy(target)
  camera.position.copy(target).add(cameraOffset)
  controls.update()
}

function positionFromRow(row: GaiaRow) {
  return new THREE.Vector3(...cartesianPosition(row))
}

function recordMeasurementEndpoint(object: AtlasObject) {
  measurementEndpoints = appendSelectionEndpoint(measurementEndpoints, object)
  renderMeasurement()
}

function clearMeasurement() {
  measurementEndpoints = []
  renderMeasurement()
}

function renderMeasurement() {
  measurementDetails.replaceChildren()
  routeHopDetails.replaceChildren()
  routeHops.hidden = true
  routeHops.open = false
  routePositions = []
  measurementClear.hidden = !measurementEndpoints.length

  if (!measurementEndpoints.length) {
    measurementStatus.textContent = 'Select a first star, then a second star.'
    return
  }

  if (measurementEndpoints.length === 1) {
    measurementStatus.textContent = 'First endpoint selected. Select a distinct second star.'
    appendDetail(measurementDetails, 'First star', sourceDisplayName(measurementEndpoints[0]))
    return
  }

  const endpointPositions = measurementEndpoints.map(positionFromObject)
  const distanceParsecs = routeDistanceFromPositions(endpointPositions.map(({ x, y, z }) => [x, y, z]))
  const distanceLightYears = distanceParsecs * LIGHT_YEARS_PER_PARSEC
  measurementStatus.textContent = 'Overall travel distance from the displayed Gaia coordinates.'
  appendDetail(measurementDetails, 'Stops', String(measurementEndpoints.length))
  appendDetail(measurementDetails, 'Overall distance (ly)', distanceLightYears.toPrecision(8))
  appendDetail(measurementDetails, 'Overall distance (light-megaseconds)', (distanceLightYears * LIGHT_MEGASECONDS_PER_LIGHT_YEAR).toPrecision(8))
  appendDetail(measurementDetails, 'Overall distance (pc)', distanceParsecs.toPrecision(8))
  measurementEndpoints.slice(1).forEach((endpoint, index) => {
    const previous = measurementEndpoints[index]
    const hopParsecs = cartesianDistance(
      endpointPositions[index].toArray() as [number, number, number],
      endpointPositions[index + 1].toArray() as [number, number, number],
    )
    const hopLightYears = hopParsecs * LIGHT_YEARS_PER_PARSEC
    appendDetail(
      routeHopDetails,
      `Hop ${index + 1}: ${sourceDisplayName(previous)} → ${sourceDisplayName(endpoint)}`,
      `${hopLightYears.toPrecision(8)} ly · ${hopParsecs.toPrecision(8)} pc`,
    )
  })
  routeHops.hidden = false
  routePositions = endpointPositions
}

function updateRouteOverlay() {
  routeOverlay.style.display = routePositions.length < 2 ? 'none' : 'block'
  if (routePositions.length < 2) return

  const { clientWidth: width, clientHeight: height } = sceneContainer
  const points = routePositions.map((position) => {
    const projected = relativePositionFromAbsolute(position).project(camera)
    return `${(projected.x * 0.5 + 0.5) * width},${(-projected.y * 0.5 + 0.5) * height}`
  })
  routePath.setAttribute('points', points.join(' '))

  while (routeMarkers.childElementCount < routePositions.length) {
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    marker.classList.add('route-marker')
    marker.setAttribute('r', '5')
    routeMarkers.append(marker)
  }
  while (routeMarkers.childElementCount > routePositions.length) {
    routeMarkers.lastElementChild?.remove()
  }
  Array.from(routeMarkers.children).forEach((marker, index) => {
    const [x, y] = points[index].split(',')
    marker.setAttribute('cx', x)
    marker.setAttribute('cy', y)
  })
}

function sourceDisplayName(object: AtlasObject) {
  if (isNonGaiaStar(object)) return object.name
  const row = object
  return PROMINENT_STAR_LABELS[row.sourceId]
    ?? formatHostNames(row.hostNames ?? knownCatalogIdentifiers[row.sourceId]?.[0])
    ?? `Gaia DR3 ${row.sourceId}`
}

function formatHostNames(hostNames: string | undefined) {
  return hostNames?.split('; ').map(formatHostName).join('; ')
}

function formatHostName(hostName: string) {
  return formatDisplayName(hostName)
}

function appendDetail(details: HTMLDListElement, term: string, value: string) {
  const container = document.createElement('div')
  const label = document.createElement('dt')
  const detail = document.createElement('dd')
  label.textContent = term
  detail.textContent = value
  container.append(label, detail)
  details.append(container)
}

function writeColorFromBpRp(bpRp: number | undefined, colors: Float32Array, offset: number) {
  if (bpRp === undefined || !Number.isFinite(bpRp)) {
    colors.set([0.65, 0.68, 0.74], offset)
    return
  }

  const index = COLOR_STOPS.findIndex(([value]) => value >= bpRp)
  const [lowerValue, lowerColor] = COLOR_STOPS[Math.max(index - 1, 0)]
  const [upperValue, upperColor] = COLOR_STOPS[index === -1 ? COLOR_STOPS.length - 1 : index]
  const fraction = lowerValue === upperValue ? 0 : THREE.MathUtils.clamp((bpRp - lowerValue) / (upperValue - lowerValue), 0, 1)
  colors.set(lowerColor.map((component, colorIndex) => THREE.MathUtils.lerp(component, upperColor[colorIndex], fraction)), offset)
}

function pointSizeFromAbsoluteMagnitude(magnitude: number | undefined, distanceParsecs: number) {
  if (magnitude === undefined || !Number.isFinite(magnitude)) return 4

  const absoluteMagnitude = magnitude - 5 * (Math.log10(distanceParsecs) - 1)
  const gBandFluxProxy = 10 ** (-0.4 * absoluteMagnitude)
  return THREE.MathUtils.clamp(4 + 2 * Math.sqrt(gBandFluxProxy), 4, 16)
}

function showSelection(object: AtlasObject) {
  renderSelectedObject(object)
  recordMeasurementEndpoint(object)
}

function clearSelectedSource() {
  selectionPanel.hidden = true
  selectionName.textContent = ''
  selectionDetails.replaceChildren()
}

function renderSelectedSource(row: GaiaRow) {
  selectionPanel.hidden = false
  const distanceParsecs = 1000 / row.parallax
  const preferredName = PROMINENT_STAR_LABELS[row.sourceId]
  selectionName.textContent = sourceDisplayName(row)
  const fields: Array<[string, string]> = [
    ['Gaia source ID', row.sourceId],
    ['RA (deg)', row.ra.toFixed(8)],
    ['Dec (deg)', row.dec.toFixed(8)],
    ['Parallax (mas)', row.parallax.toFixed(5)],
    ['Display distance (pc)', distanceParsecs.toPrecision(7)],
    ['Display distance (ly)', (distanceParsecs * LIGHT_YEARS_PER_PARSEC).toPrecision(7)],
  ]
  if (preferredName && row.hostNames !== preferredName) {
    fields.unshift(['NASA host identifier(s)', row.hostNames ?? ''])
  }
  if (row.parallaxError !== undefined && Number.isFinite(row.parallaxError)) {
    fields.push(['Parallax uncertainty (mas)', row.parallaxError.toPrecision(5)])
  }
  if (row.magnitude !== undefined && Number.isFinite(row.magnitude)) {
    fields.push(['Mean G magnitude', row.magnitude.toFixed(4)])
    fields.push(['Display absolute G magnitude', (row.magnitude - 5 * (Math.log10(distanceParsecs) - 1)).toFixed(4)])
  }
  if (row.bpRp !== undefined && Number.isFinite(row.bpRp)) fields.push(['BP−RP color index (mag)', row.bpRp.toFixed(4)])
  if (!preferredName && row.hostNames) fields.push(['NASA host identifier(s)', row.hostNames])
  if (row.sourceCategory) fields.push(['Catalog category', row.sourceCategory])
  if (row.planetCount !== undefined && Number.isFinite(row.planetCount)) {
    fields.push(['Confirmed planets', String(row.planetCount)])
  }
  if (row.planetNames) fields.push(['Planet name(s)', row.planetNames])
  if (row.discoveryMethods) fields.push(['Discovery method(s)', row.discoveryMethods])
  if (row.knownSystemDiameterAu !== undefined && Number.isFinite(row.knownSystemDiameterAu)) {
    fields.push(['Known planetary-system diameter (AU)', row.knownSystemDiameterAu.toPrecision(8)])
  }
  if (row.knownSystemDiameterLightSeconds !== undefined && Number.isFinite(row.knownSystemDiameterLightSeconds)) {
    fields.push(['Known planetary-system diameter (light-seconds)', row.knownSystemDiameterLightSeconds.toPrecision(8)])
  }
  if (row.evidence) fields.push(['Evidence', row.evidence])

  selectionDetails.replaceChildren(...fields.map(([term, detail]) => {
    const container = document.createElement('div')
    const label = document.createElement('dt')
    const value = document.createElement('dd')
    label.textContent = term
    value.textContent = detail
    container.append(label, value)
    return container
  }))
}
