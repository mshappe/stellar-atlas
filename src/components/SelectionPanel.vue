<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  name?: string
  summaryFields: Array<[string, string]>
  detailFields: Array<[string, string]>
}>()

const detailsDialog = ref<HTMLDialogElement>()

function openDetails() {
  detailsDialog.value?.showModal()
}

function closeDetails() {
  detailsDialog.value?.close()
}
</script>

<template>
  <section v-if="name">
    <p class="selection-heading">
      Selected source
    </p>
    <h2 class="source-name">
      {{ name }}
    </h2>
    <dl>
      <div
        v-for="[term, detail] in summaryFields"
        :key="term"
      >
        <dt>{{ term }}</dt>
        <dd>{{ detail }}</dd>
      </div>
    </dl>
    <button
      v-if="detailFields.length"
      class="selection-details-link"
      type="button"
      @click="openDetails"
    >
      Details
    </button>
    <dialog
      v-if="detailFields.length"
      ref="detailsDialog"
      class="selection-details-dialog"
      :aria-label="`${name} details`"
    >
      <div class="selection-details-header">
        <h2>Details</h2>
        <button
          class="selection-details-close"
          type="button"
          @click="closeDetails"
        >
          Close
        </button>
      </div>
      <dl>
        <div
          v-for="[term, detail] in detailFields"
          :key="term"
        >
          <dt>{{ term }}</dt>
          <dd>{{ detail }}</dd>
        </div>
      </dl>
    </dialog>
  </section>
</template>
