<script setup lang="ts">
import { ref, useId } from 'vue'

defineProps<{
  label: string
  tooltip: string
}>()

const isOpen = ref(false)
const tooltipId = useId()
</script>

<template>
  <span
    class="tooltip-label"
    :class="{ 'tooltip-label-open': isOpen }"
  >
    <button
      class="tooltip-label-trigger"
      type="button"
      :aria-describedby="tooltipId"
      :aria-expanded="isOpen"
      @focus="isOpen = true"
      @blur="isOpen = false"
      @click="isOpen = true"
      @keydown.escape="isOpen = false"
    >
      {{ label }}
    </button>
    <span
      :id="tooltipId"
      class="tooltip-label-content"
      role="tooltip"
    >{{ tooltip }}</span>
  </span>
</template>
