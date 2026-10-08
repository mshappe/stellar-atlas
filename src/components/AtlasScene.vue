<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { MAX_DISTANCE_PARSECS, PROMINENT_STAR_LABELS, SOL } from '../atlas-data'
import type { AtlasObject, GaiaRow, ParsedCatalog } from '../atlas-types'
import { cartesianPosition, relativeCartesianPosition } from '../catalog'

const props = defineProps<{
  catalog?: ParsedCatalog
  selectedOrigin: AtlasObject
  hideUnlabeledStars: boolean
  labelIds: ReadonlySet<string>
  alternativeLabelIds: ReadonlySet<string>
  routeEndpoints: AtlasObject[]
  displayName: (object: AtlasObject) => string
}>()

const emit = defineEmits<{
  select: [object: AtlasObject]
  focus: [object: AtlasObject]
  popRoute: []
}>()

const COLOR_STOPS: Array<[number, [number, number, number]]> = [
  [-0.5, [0.55, 0.7, 1]],
  [0, [0.85, 0.9, 1]],
  [0.6, [1, 0.95, 0.8]],
  [1.2, [1, 0.72, 0.45]],
  [2.2, [1, 0.43, 0.25]],
  [4, [0.74, 0.13, 0.12]],
]

const sceneElement = ref<HTMLDivElement>()
const catalogRows = computed(() => props.catalog?.rows ?? [])
let scene: THREE.Scene | undefined
let camera: THREE.PerspectiveCamera | undefined
let renderer: THREE.WebGLRenderer | undefined
let labelRenderer: CSS2DRenderer | undefined
let controls: OrbitControls | undefined
let routeOverlay: SVGSVGElement | undefined
let routePath: SVGPolylineElement | undefined
let routeMarkers: SVGGElement | undefined
let resizeObserver: ResizeObserver | undefined
let animationFrame: number | undefined
let stars: THREE.Points | undefined
let solMarker: THREE.Points | undefined
let solLabel: CSS2DObject | undefined
let starLabels: THREE.Group | undefined
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

onMounted(() => {
  if (!sceneElement.value) return
  initializeScene(sceneElement.value)
  renderCatalog()
  resizeRenderer()
  render()
})

onBeforeUnmount(() => {
  if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
  clearRenderedCatalog()
  if (solMarker) {
    solMarker.geometry.dispose()
    ;(solMarker.material as THREE.Material).dispose()
  }
  renderer?.dispose()
  renderer?.domElement.remove()
  labelRenderer?.domElement.remove()
  routeOverlay?.remove()
})

watch(() => props.catalog, renderCatalog)
watch(() => props.selectedOrigin, () => {
  renderCatalog()
  updateSolRenderPosition()
})
watch(() => props.labelIds, () => {
  renderStarLabels()
  setPointVisibility()
})
watch(() => props.alternativeLabelIds, renderStarLabels)
watch(() => props.hideUnlabeledStars, setPointVisibility)

function initializeScene(container: HTMLDivElement) {
  scene = new THREE.Scene()
  scene.background = new THREE.Color('#07101d')
  camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1e12)
  camera.position.set(10, 10, 10)
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.domElement.addEventListener('click', selectPoint)
  renderer.domElement.addEventListener('dblclick', focusPoint)
  container.append(renderer.domElement)

  routeOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  routeOverlay.classList.add('route-overlay')
  routePath = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
  routePath.classList.add('route-path')
  routeMarkers = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  routeOverlay.append(routePath, routeMarkers)
  container.append(routeOverlay)

  labelRenderer = new CSS2DRenderer()
  labelRenderer.domElement.className = 'label-layer'
  container.append(labelRenderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 0.01
  controls.maxDistance = 1e12

  scene.add(new THREE.AxesHelper(1))
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(MAX_DISTANCE_PARSECS, 48, 32),
    new THREE.MeshBasicMaterial({ color: '#3f99c3', wireframe: true, transparent: true, opacity: 0.18 }),
  ))
  solMarker = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)),
    new THREE.PointsMaterial({ color: '#ffd56a', size: 8, sizeAttenuation: false }),
  )
  scene.add(solMarker)
  solLabel = createSolLabel()
  scene.add(solLabel)
  starLabels = new THREE.Group()
  scene.add(starLabels)
  raycaster.params.Points!.threshold = 0.25

  container.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    if (props.routeEndpoints.length) emit('popRoute')
  })
  resizeObserver = new ResizeObserver(resizeRenderer)
  resizeObserver.observe(container)
}

function createSolLabel() {
  const anchor = document.createElement('div')
  anchor.className = 'star-label-anchor sol-label-anchor'
  const element = document.createElement('span')
  element.className = 'star-label sol-label'
  element.textContent = SOL.name
  element.addEventListener('click', (event) => {
    event.stopPropagation()
    emit('select', SOL)
  })
  element.addEventListener('dblclick', (event) => {
    event.preventDefault()
    event.stopPropagation()
    emit('select', SOL)
    emit('focus', SOL)
  })
  anchor.append(element)
  const label = new CSS2DObject(anchor)
  label.center.set(0, 0)
  return label
}

function resizeRenderer() {
  if (!sceneElement.value || !camera || !renderer || !labelRenderer || !routeOverlay) return
  const { clientWidth: width, clientHeight: height } = sceneElement.value
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height, false)
  labelRenderer.setSize(width, height)
  routeOverlay.setAttribute('viewBox', `0 0 ${width} ${height}`)
}

function render() {
  if (!scene || !camera || !renderer || !labelRenderer || !controls) return
  controls.update()
  renderer.render(scene, camera)
  updateRouteOverlay()
  labelRenderer.render(scene, camera)
  animationFrame = requestAnimationFrame(render)
}

function renderCatalog() {
  if (!scene || !camera || !controls) return
  clearRenderedCatalog()
  const rows = catalogRows.value
  if (!rows.length) {
    updateSolRenderPosition()
    return
  }

  const positions = new Float32Array(rows.length * 3)
  const colors = new Float32Array(rows.length * 3)
  const pointSizes = new Float32Array(rows.length)
  const pointVisibility = new Float32Array(rows.length)
  let farthest = 0
  rows.forEach((row, index) => {
    const position = relativePosition(row)
    positions.set([position.x, position.y, position.z], index * 3)
    pointVisibility[index] = 1
    farthest = Math.max(farthest, position.length())
    writeColor(row.bpRp, colors, index * 3)
    pointSizes[index] = pointSize(row.magnitude, positionFromRow(row).length())
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
        gl_PointSize = pointVisibility > 0.5 ? clamp(pointSize * (300.0 / max(0.001, -modelViewPosition.z)), 6.0, 18.0) : 0.0;
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
  setPointVisibility()
  updateSolRenderPosition()

  const framingDistance = Math.max(MAX_DISTANCE_PARSECS * 2.2, farthest * 2.2, 2)
  camera.position.set(framingDistance, framingDistance * 0.65, framingDistance * 0.45)
  camera.near = Math.max(farthest / 1e7, 0.00001)
  camera.far = Math.max(farthest * 10, 100)
  camera.updateProjectionMatrix()
  controls.target.set(0, 0, 0)
  controls.update()
}

function clearRenderedCatalog() {
  if (!stars || !scene) return
  scene.remove(stars)
  stars.geometry.dispose()
  ;(stars.material as THREE.Material).dispose()
  stars = undefined
  starLabels?.clear()
}

function renderStarLabels() {
  if (!starLabels) return
  starLabels.clear()
  for (const row of catalogRows.value) {
    const officialName = PROMINENT_STAR_LABELS[row.sourceId]
    const alternative = props.alternativeLabelIds.has(row.sourceId)
    const name = officialName ?? (alternative ? props.displayName(row) : undefined)
    if (!name) continue
    const anchor = document.createElement('div')
    anchor.className = 'star-label-anchor'
    const element = document.createElement('span')
    element.className = alternative ? 'star-label alternative-star-label' : 'star-label'
    element.textContent = name
    element.addEventListener('click', (event) => {
      event.stopPropagation()
      emit('select', row)
    })
    element.addEventListener('dblclick', (event) => {
      event.preventDefault()
      event.stopPropagation()
      emit('select', row)
      emit('focus', row)
    })
    anchor.append(element)
    const label = new CSS2DObject(anchor)
    label.center.set(0, 0)
    label.position.copy(relativePosition(row))
    starLabels.add(label)
  }
}

function setPointVisibility() {
  if (!stars) return
  const visibility = stars.geometry.getAttribute('pointVisibility') as THREE.BufferAttribute
  catalogRows.value.forEach((row, index) => {
    visibility.setX(index, !props.hideUnlabeledStars || props.labelIds.has(row.sourceId) ? 1 : 0)
  })
  visibility.needsUpdate = true
}

function selectPoint(event: MouseEvent) {
  const object = pickObject(event)
  if (object) emit('select', object)
}

function focusPoint(event: MouseEvent) {
  const object = pickObject(event)
  if (!object) return
  emit('select', object)
  focusOnObject(object)
  emit('focus', object)
}

function pickObject(event: MouseEvent): AtlasObject | undefined {
  if (!camera || !renderer) return undefined
  const bounds = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const intersection = stars ? raycaster.intersectObject(stars)[0] : undefined
  const row = intersection?.index === undefined ? undefined : catalogRows.value[intersection.index]
  if (row && (!props.hideUnlabeledStars || props.labelIds.has(row.sourceId))) return row
  return solMarker && raycaster.intersectObject(solMarker)[0] ? SOL : undefined
}

function focusOnObject(object: AtlasObject) {
  if (!camera || !controls) return
  const target = relativePosition(object)
  const cameraOffset = camera.position.clone().sub(controls.target)
  controls.target.copy(target)
  camera.position.copy(target).add(cameraOffset)
  controls.update()
}

function updateSolRenderPosition() {
  const position = relativePosition(SOL)
  solMarker?.position.copy(position)
  solLabel?.position.copy(position)
}

function updateRouteOverlay() {
  if (!routeOverlay || !routePath || !routeMarkers || !camera || !sceneElement.value) return
  const activeCamera = camera
  routeOverlay.style.display = props.routeEndpoints.length < 2 ? 'none' : 'block'
  if (props.routeEndpoints.length < 2) return
  const { clientWidth: width, clientHeight: height } = sceneElement.value
  const points = props.routeEndpoints.map((endpoint) => {
    const projected = relativePosition(endpoint).project(activeCamera)
    return `${(projected.x * 0.5 + 0.5) * width},${(-projected.y * 0.5 + 0.5) * height}`
  })
  routePath.setAttribute('points', points.join(' '))
  while (routeMarkers.childElementCount < points.length) {
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    marker.classList.add('route-marker')
    marker.setAttribute('r', '5')
    routeMarkers.append(marker)
  }
  while (routeMarkers.childElementCount > points.length) routeMarkers.lastElementChild?.remove()
  Array.from(routeMarkers.children).forEach((marker, index) => {
    const [x, y] = points[index].split(',')
    marker.setAttribute('cx', x)
    marker.setAttribute('cy', y)
  })
}

function relativePosition(object: AtlasObject) {
  return new THREE.Vector3(...relativeCartesianPosition(
    positionFromObject(object).toArray() as [number, number, number],
    positionFromObject(props.selectedOrigin).toArray() as [number, number, number],
  ))
}

function positionFromObject(object: AtlasObject) {
  return isNonGaiaStar(object) ? new THREE.Vector3(...object.position) : positionFromRow(object)
}

function positionFromRow(row: GaiaRow) {
  return new THREE.Vector3(...cartesianPosition(row))
}

function isNonGaiaStar(object: AtlasObject): object is typeof SOL {
  return 'position' in object
}

function writeColor(bpRp: number | undefined, colors: Float32Array, offset: number) {
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

function pointSize(magnitude: number | undefined, distanceParsecs: number) {
  if (magnitude === undefined || !Number.isFinite(magnitude)) return 4
  const absoluteMagnitude = magnitude - 5 * (Math.log10(distanceParsecs) - 1)
  return THREE.MathUtils.clamp(4 + 2 * Math.sqrt(10 ** (-0.4 * absoluteMagnitude)), 4, 16)
}

defineExpose({ focusObject: focusOnObject })
</script>

<template>
  <div
    ref="sceneElement"
    class="atlas-scene"
    aria-label="Interactive three-dimensional stellar field"
  />
</template>
