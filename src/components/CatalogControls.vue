<script setup lang="ts">
import { ref } from 'vue'
import { MAXIMUM_PROJECTION_EPOCH, MINIMUM_PROJECTION_EPOCH } from '../atlas-data'
import type { CatalogKey } from '../atlas-types'

defineProps<{
  selectedCatalogKey: CatalogKey | undefined
  hideUnlabeledStars: boolean
  importStatus: string
  labelCatalogStatus: string
  projectionEpoch: number | undefined
  projectionAvailable: boolean
  projectedSourceCount: number | undefined
  projectionRendering: boolean
}>()

const emit = defineEmits<{
  changeCatalog: [catalogKey: CatalogKey]
  toggleLabels: []
  importFile: [file: File]
  retryLabels: []
  changeProjectionEpoch: [epoch: number | undefined]
}>()

const settingsDialog = ref<HTMLDialogElement>()

function importCatalog(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('importFile', file)
  input.value = ''
}

function changeCatalog(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value === 'confirmed-hosts' || value === 'all-stars') emit('changeCatalog', value)
}

function changeProjectionEpoch(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  emit('changeProjectionEpoch', Number.isFinite(value) ? value : undefined)
}

function openSettings() {
  const dialog = settingsDialog.value
  if (!dialog || dialog.open) return
  if (typeof dialog.showModal === 'function') dialog.showModal()
  else dialog.setAttribute('open', '')
}

function closeSettings() {
  const dialog = settingsDialog.value
  if (!dialog || !dialog.open) return
  if (typeof dialog.close === 'function') dialog.close()
  else dialog.removeAttribute('open')
}
</script>

<template>
  <button
    class="settings-toggle"
    type="button"
    aria-label="Open settings"
    title="Settings"
    @click="openSettings"
  >
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
    >
      <path d="M19.14 12.94a7.8 7.8 0 0 0 .05-.94 7.8 7.8 0 0 0-.05-.94l2.03-1.58-1.92-3.32-2.39.96a7.1 7.1 0 0 0-1.63-.94l-.36-2.54h-3.84l-.36 2.54a7.1 7.1 0 0 0-1.63.94l-2.39-.96-1.92 3.32 2.03 1.58a7.8 7.8 0 0 0-.05.94c0 .32.02.63.05.94l-2.03 1.58 1.92 3.32 2.39-.96c.5.39 1.05.71 1.63.94l.36 2.54h3.84l.36-2.54c.58-.23 1.13-.55 1.63-.94l2.39.96 1.92-3.32-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" />
    </svg>
  </button>
  <dialog
    ref="settingsDialog"
    class="catalog-settings-dialog"
    aria-label="Settings"
  >
    <div class="selection-details-header">
      <h2>Settings</h2>
      <button
        class="selection-details-close"
        type="button"
        @click="closeSettings"
      >
        Close
      </button>
    </div>
    <section class="catalog-settings">
      <h3>Catalog input</h3>
      <p>The default map contains confirmed exoplanet hosts plus explicitly identified named reference stars. Switch to the complete Gaia volume whenever you need another comparison or candidate.</p>
      <label
        class="catalog-control"
        for="catalog-mode"
      >
        <span>Bundled map</span>
        <select
          id="catalog-mode"
          :value="selectedCatalogKey ?? ''"
          @change="changeCatalog"
        >
          <option
            value=""
            disabled
          >
            Imported Gaia DR3 CSV
          </option>
          <option value="confirmed-hosts">Focused stars (545)</option>
          <option value="all-stars">All Gaia DR3 sources (40,188)</option>
        </select>
      </label>
      <button
        class="label-toggle"
        type="button"
        @click="emit('toggleLabels')"
      >
        {{ hideUnlabeledStars ? 'Show unlabeled stars' : 'Hide unlabeled stars' }}
      </button>
      <p
        v-if="projectionEpoch !== undefined"
        class="status"
      >
        {{ projectedSourceCount?.toLocaleString() }} focused sources have measured 6D inputs and are rendered at the projected epoch. Their physical displacement may be visually small within the 150-ly field; select a source for exact coordinates and displacement.
      </p>
      <p
        v-if="projectionRendering"
        class="status"
        role="status"
        aria-live="polite"
      >
        Updating projected positions…
      </p>
      <label
        v-if="projectionEpoch !== undefined"
        class="catalog-control"
        for="projection-epoch"
      >
        <span>Projected epoch: {{ projectionEpoch ?? 'J2016.0 (catalog epoch)' }}</span>
        <input
          id="projection-epoch"
          type="range"
          :min="MINIMUM_PROJECTION_EPOCH"
          :max="MAXIMUM_PROJECTION_EPOCH"
          step="1"
          :value="projectionEpoch"
          :disabled="!projectionAvailable"
          @input="changeProjectionEpoch"
        >
      </label>
      <button
        v-else
        class="measure-clear"
        type="button"
        :disabled="!projectionAvailable"
        @click="emit('changeProjectionEpoch', MINIMUM_PROJECTION_EPOCH)"
      >
        Enable future projection from J{{ MINIMUM_PROJECTION_EPOCH.toFixed(1) }}
      </button>
      <p
        v-if="!projectionAvailable"
        class="status"
      >
        Projected epochs require the enriched focused catalog.
      </p>
      <button
        v-if="projectionEpoch !== undefined"
        class="measure-clear"
        type="button"
        @click="emit('changeProjectionEpoch', undefined)"
      >
        Return to J2016.0
      </button>
      <label
        class="upload-control"
        for="catalog-file"
      >
        <span>Choose Gaia DR3 CSV</span>
        <input
          id="catalog-file"
          type="file"
          accept=".csv,text/csv"
          @change="importCatalog"
        >
      </label>
      <p
        class="status"
        role="status"
      >
        {{ importStatus }}
      </p>
      <template v-if="labelCatalogStatus">
        <p
          class="status"
          role="status"
        >
          {{ labelCatalogStatus }}
        </p>
        <button
          class="measure-clear"
          type="button"
          @click="emit('retryLabels')"
        >
          Retry permanent labels
        </button>
      </template>
    </section>
  </dialog>
</template>
