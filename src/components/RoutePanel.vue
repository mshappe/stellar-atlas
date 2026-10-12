<script setup lang="ts">
import TooltipLabel from './TooltipLabel.vue'

defineProps<{
  status: string
  tooltip?: string
  fields: Array<[string, string]>
  hops: Array<[string, string]>
  hasEndpoints: boolean
}>()

const emit = defineEmits<{ clear: [] }>()
</script>

<template>
  <section class="route-panel">
    <h2>
      <TooltipLabel
        v-if="tooltip"
        class="route-tooltip-label"
        label="Point-to-point distance"
        :tooltip="tooltip"
      />
      <span v-else>Point-to-point distance</span>
    </h2>
    <p
      v-if="status"
      class="status"
    >
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
