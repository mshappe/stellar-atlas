<script setup lang="ts">
defineProps<{
  name?: string
  fields: Array<[string, string]>
}>()
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
        v-for="[term, detail] in fields"
        :key="term"
      >
        <dt>{{ term }}</dt>
        <dd>{{ detail }}</dd>
      </div>
    </dl>
  </section>
</template>
