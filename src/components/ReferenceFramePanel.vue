<script setup lang="ts">
import { ref } from 'vue'

const referenceFrameDialog = ref<HTMLDialogElement>()

function openReferenceFrame() {
  const dialog = referenceFrameDialog.value
  if (!dialog || dialog.open) return
  if (typeof dialog.showModal === 'function') dialog.showModal()
  else dialog.setAttribute('open', '')
}

function closeReferenceFrame() {
  const dialog = referenceFrameDialog.value
  if (!dialog || !dialog.open) return
  if (typeof dialog.close === 'function') dialog.close()
  else dialog.removeAttribute('open')
}
</script>

<template>
  <button
    class="info-toggle"
    type="button"
    aria-label="Open reference frame information"
    title="Reference frame"
    @click="openReferenceFrame"
  >
    <span aria-hidden="true">i</span>
  </button>
  <dialog
    ref="referenceFrameDialog"
    class="reference-frame-dialog"
    aria-label="Reference frame"
  >
    <div class="selection-details-header">
      <h2>Reference frame</h2>
      <button
        class="selection-details-close"
        type="button"
        @click="closeReferenceFrame"
      >
        Close
      </button>
    </div>
    <section class="reference-frame-panel">
      <dl>
        <div><dt>Catalog</dt><dd>Gaia DR3</dd></div>
        <div><dt>Frame</dt><dd>ICRS</dd></div>
        <div><dt>Astrometry epoch</dt><dd>J2016.0</dd></div>
        <div><dt>Distance display</dt><dd>1 / parallax</dd></div>
        <div><dt>Point color</dt><dd>Gaia BP−RP index</dd></div>
        <div><dt>Point size</dt><dd>Absolute G magnitude</dd></div>
        <div><dt>Map radius</dt><dd>150 ly</dd></div>
      </dl>
      <p class="caveat">
        The cyan wire sphere marks the exact 150-ly volume around TRAPPIST-1. Colors are a visual mapping of measured BP−RP, and size is an extinction-unadjusted luminosity proxy—not physical radius or a spectral-type classification.
      </p>
    </section>
  </dialog>
</template>
