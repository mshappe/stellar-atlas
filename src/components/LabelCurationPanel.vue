<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { AtlasSession, LabelCandidates } from '../label-api'

const props = defineProps<{
  open: boolean
  removalOpen: boolean
  session: AtlasSession | undefined
  sourceId: string | undefined
  sourceName: string | undefined
  existingLabel: string | undefined
  candidates: LabelCandidates | undefined
  sessionStatus: string
  candidateError: string
  creationError: string
  retirementError: string
  logoutError: string
  loadingCandidates: boolean
  creatingLabel: boolean
  retiringLabel: boolean
  signingOut: boolean
}>()

const emit = defineEmits<{
  signIn: []
  signOut: []
  create: [sourceId: string, displayLabel: string]
  retryCandidates: []
  retire: []
  closeMenu: []
  closeRemoval: []
}>()

const curationDialog = ref<HTMLDialogElement>()
const removalDialog = ref<HTMLDialogElement>()

watch(() => props.open, async (open) => {
  await nextTick()
  synchronizeDialog(curationDialog.value, open)
})

watch(() => props.removalOpen, async (open) => {
  await nextTick()
  synchronizeDialog(removalDialog.value, open)
})

function synchronizeDialog(dialog: HTMLDialogElement | undefined, open: boolean) {
  if (!dialog || dialog.open === open) return
  if (open) {
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    return
  }
  if (typeof dialog.close === 'function') dialog.close()
  else dialog.removeAttribute('open')
}

function createLabel(event: Event) {
  const displayLabel = new FormData(event.currentTarget as HTMLFormElement).get('displayLabel')
  if (props.sourceId && typeof displayLabel === 'string') emit('create', props.sourceId, displayLabel)
}

function closeCurationDialog() {
  if (typeof curationDialog.value?.close === 'function') curationDialog.value.close()
  else emit('closeMenu')
}

function closeRemovalDialog() {
  if (typeof removalDialog.value?.close === 'function') removalDialog.value.close()
  else emit('closeRemoval')
}
</script>

<template>
  <dialog
    ref="curationDialog"
    class="label-curation-dialog"
    aria-label="Permanent label options"
    @close="emit('closeMenu')"
  >
    <div class="selection-details-header">
      <h2>Permanent labels</h2>
      <div class="dialog-actions">
        <button
          v-if="session?.authenticated"
          class="selection-details-close"
          type="button"
          :disabled="signingOut"
          @click="emit('signOut')"
        >
          {{ signingOut ? 'Signing out…' : 'Sign out' }}
        </button>
        <button
          class="selection-details-close"
          type="button"
          :disabled="signingOut"
          @click="closeCurationDialog"
        >
          Close
        </button>
      </div>
    </div>
    <p
      v-if="logoutError"
      class="status"
      role="status"
    >
      {{ logoutError }}
    </p>
    <p
      v-if="session === undefined"
      class="status"
      role="status"
    >
      {{ sessionStatus || 'Checking maintainer session…' }}
    </p>
    <template v-else-if="!session.authenticated">
      <p>Maintainers may add only server-verified catalog identifiers.</p>
      <button
        class="measure-clear"
        type="button"
        @click="emit('signIn')"
      >
        Sign in with GitHub
      </button>
    </template>
    <p
      v-else-if="!session.maintainer"
      class="status"
    >
      Signed in as {{ session.login }}. This account cannot curate permanent labels.
    </p>
    <template v-else-if="!sourceId">
      <p class="status">
        Signed in as {{ session.login }}.
      </p>
      <p class="status">
        Select a Gaia DR3 source to review its verified label candidates.
      </p>
    </template>
    <p
      v-else-if="existingLabel"
      class="status"
    >
      Signed in as {{ session.login }}. This source is already permanently labeled as {{ existingLabel }}.
    </p>
    <template v-else>
      <p class="status">
        Signed in as {{ session.login }}.
      </p>
      <p
        v-if="candidateError"
        class="status"
        role="status"
      >
        {{ candidateError }}
      </p>
      <button
        v-if="candidateError"
        class="measure-clear"
        type="button"
        @click="emit('retryCandidates')"
      >
        Retry verified candidates
      </button>
      <p
        v-if="creationError"
        class="status"
        role="status"
      >
        {{ creationError }}
      </p>
      <p
        v-if="creatingLabel"
        class="status"
        role="status"
      >
        Creating permanent label…
      </p>
      <form
        v-if="candidates?.sourceId === sourceId"
        class="curation-form"
        @submit.prevent="createLabel"
      >
        <label>
          <span>Verified identifier</span>
          <select
            name="displayLabel"
            required
            :disabled="creatingLabel"
          >
            <option
              v-for="candidate in candidates.candidates"
              :key="candidate.displayLabel"
              :value="candidate.displayLabel"
            >
              {{ candidate.displayLabel }} · {{ candidate.authority }}
            </option>
          </select>
        </label>
        <button
          class="measure-clear"
          type="submit"
          :disabled="creatingLabel"
        >
          {{ creatingLabel ? 'Creating permanent label…' : 'Make permanent' }}
        </button>
      </form>
      <p
        v-else-if="loadingCandidates && !candidateError"
        class="status"
        role="status"
      >
        Loading server-verified label candidates…
      </p>
    </template>
  </dialog>
  <dialog
    ref="removalDialog"
    class="label-curation-dialog"
    :aria-label="`Remove permanent label for ${sourceName}`"
    @close="emit('closeRemoval')"
  >
    <div class="selection-details-header">
      <h2>Remove permanent label?</h2>
      <div class="dialog-actions">
        <button
          v-if="session?.authenticated"
          class="selection-details-close"
          type="button"
          :disabled="retiringLabel || signingOut"
          @click="emit('signOut')"
        >
          {{ signingOut ? 'Signing out…' : 'Sign out' }}
        </button>
        <button
          class="selection-details-close"
          type="button"
          :disabled="retiringLabel || signingOut"
          @click="closeRemovalDialog"
        >
          Cancel
        </button>
      </div>
    </div>
    <p
      v-if="logoutError"
      class="status"
      role="status"
    >
      {{ logoutError }}
    </p>
    <p>
      Remove {{ existingLabel }} as the permanent label for {{ sourceName }}?
    </p>
    <p
      v-if="retirementError"
      class="status"
      role="status"
    >
      {{ retirementError }}
    </p>
    <button
      class="label-removal-confirm"
      type="button"
      :disabled="retiringLabel"
      @click="emit('retire')"
    >
      {{ retiringLabel ? 'Removing permanent label…' : 'Remove permanent label' }}
    </button>
  </dialog>
</template>
