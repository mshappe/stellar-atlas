<script setup lang="ts">
import { ref } from 'vue'
import type { AtlasObject } from '../atlas-types'

type SearchResult = {
  object: AtlasObject
  name: string
  identifiers: string
}

defineProps<{
  results: SearchResult[]
  status: string
}>()

const emit = defineEmits<{
  search: [query: string]
  locate: [object: AtlasObject]
  clear: []
}>()

const query = ref('')

function submitSearch() {
  emit('search', query.value)
}

function clearResults() {
  emit('clear')
}
</script>

<template>
  <section>
    <h2>Find a star</h2>
    <form
      class="search-form"
      @submit.prevent="submitSearch"
    >
      <label for="catalog-search">Known catalog identifier</label>
      <div>
        <input
          id="catalog-search"
          v-model="query"
          type="search"
          placeholder="e.g. 1069"
          autocomplete="off"
          @input="clearResults"
        >
        <button type="submit">
          Find
        </button>
      </div>
    </form>
    <p
      class="status"
      role="status"
    >
      {{ status }}
    </p>
    <ul
      v-if="results.length"
      class="search-results"
    >
      <li
        v-for="result in results"
        :key="result.object.sourceId"
      >
        <button
          type="button"
          @click="emit('locate', result.object)"
        >
          {{ result.name }}
        </button>
        <span>{{ result.identifiers }}</span>
      </li>
    </ul>
  </section>
</template>
