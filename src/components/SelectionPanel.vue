<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  name?: string
  summaryFields: Array<[string, string]>
  detailFields: Array<[string, string]>
  labelAction?: 'add' | 'remove'
}>()

const emit = defineEmits<{
  openLabelMenu: []
  requestLabelRemoval: []
}>()

const detailsDialog = ref<HTMLDialogElement>()
const systemDiameterTooltip = 'Twice the largest known planetary apoastron: 2 × max[a × (1 + e)]. Excludes stellar companions, debris disks, unreported planets, and planets without both orbital measurements.'

function openDetails() {
  detailsDialog.value?.showModal()
}

function closeDetails() {
  detailsDialog.value?.close()
}

function handleLabelAction() {
  if (props.labelAction === 'add') emit('openLabelMenu')
  if (props.labelAction === 'remove') emit('requestLabelRemoval')
}
</script>

<template>
  <section
    v-if="name"
    class="selected-source-panel"
  >
    <p class="selection-heading">
      Selected source
    </p>
    <div class="source-title-row">
      <h2 class="source-name">
        {{ name }}
      </h2>
      <button
        v-if="labelAction"
        class="label-action"
        type="button"
        :aria-label="labelAction === 'add' ? `Add a permanent label for ${name}` : `Remove the permanent label for ${name}`"
        @click="handleLabelAction"
      >
        {{ labelAction === 'add' ? '+' : '-' }}
      </button>
    </div>
    <dl>
      <div
        v-for="[term, detail] in summaryFields"
        :key="term"
      >
        <dt>
          <abbr
            v-if="term === 'System diameter'"
            class="system-diameter-label"
            :title="systemDiameterTooltip"
          >{{ term }}</abbr>
          <span v-else>{{ term }}</span>
        </dt>
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
          <dt>
            <abbr
              v-if="term === 'System diameter'"
              class="system-diameter-label"
              :title="systemDiameterTooltip"
            >{{ term }}</abbr>
            <span v-else>{{ term }}</span>
          </dt>
          <dd>{{ detail }}</dd>
        </div>
      </dl>
    </dialog>
  </section>
</template>
