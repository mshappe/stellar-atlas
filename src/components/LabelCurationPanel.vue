<script setup lang="ts">
import type { AtlasSession, LabelCandidates } from '../label-api'

const props = defineProps<{
  session: AtlasSession | undefined
  sourceId: string | undefined
  existingLabel: string | undefined
  candidates: LabelCandidates | undefined
  status: string
}>()

const emit = defineEmits<{
  signIn: []
  create: [sourceId: string, displayLabel: string]
}>()

function createLabel(event: Event) {
  const displayLabel = new FormData(event.currentTarget as HTMLFormElement).get('displayLabel')
  if (props.sourceId && typeof displayLabel === 'string') emit('create', props.sourceId, displayLabel)
}
</script>

<template>
  <section>
    <h2>Permanent labels</h2>
    <p
      v-if="session === undefined"
      class="status"
    >
      {{ status || 'Checking maintainer session…' }}
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
        v-if="status"
        class="status"
        role="status"
      >
        {{ status }}
      </p>
      <form
        v-else-if="candidates?.sourceId === sourceId"
        class="curation-form"
        @submit.prevent="createLabel"
      >
        <label>
          <span>Verified identifier</span>
          <select
            name="displayLabel"
            required
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
        >
          Make permanent
        </button>
      </form>
      <p
        v-else
        class="status"
      >
        Loading server-verified label candidates…
      </p>
    </template>
  </section>
</template>
