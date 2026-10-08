<script setup lang="ts">
import type { CatalogKey } from '../atlas-types'

defineProps<{
  selectedCatalogKey: CatalogKey | undefined
  hideUnlabeledStars: boolean
  importStatus: string
  labelCatalogStatus: string
}>()

const emit = defineEmits<{
  changeCatalog: [catalogKey: CatalogKey]
  toggleLabels: []
  importFile: [file: File]
  retryLabels: []
}>()

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
</script>

<template>
  <section>
    <h2>Catalog input</h2>
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
        <option value="confirmed-hosts">Focused stars (1,000)</option>
        <option value="all-stars">All Gaia DR3 sources (443,660)</option>
      </select>
    </label>
    <button
      class="label-toggle"
      type="button"
      @click="emit('toggleLabels')"
    >
      {{ hideUnlabeledStars ? 'Show unlabeled stars' : 'Hide unlabeled stars' }}
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
</template>
