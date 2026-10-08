<script setup lang="ts">
defineProps<{
  status: string
  fields: Array<[string, string]>
  hops: Array<[string, string]>
  hasEndpoints: boolean
}>()

const emit = defineEmits<{ clear: [] }>()
</script>

<template>
  <section>
    <h2>Point-to-point distance</h2>
    <p class="status">
      {{ status }}
    </p>
    <dl>
      <div
        v-for="[term, detail] in fields"
        :key="term"
      >
        <dt>{{ term }}</dt>
        <dd>{{ detail }}</dd>
      </div>
    </dl>
    <details
      v-if="hops.length"
      id="route-hops"
    >
      <summary>Show individual hops</summary>
      <dl id="route-hop-details">
        <div
          v-for="[term, detail] in hops"
          :key="term"
        >
          <dt>{{ term }}</dt>
          <dd>{{ detail }}</dd>
        </div>
      </dl>
    </details>
    <button
      v-if="hasEndpoints"
      class="measure-clear"
      type="button"
      @click="emit('clear')"
    >
      Clear route
    </button>
  </section>
</template>
