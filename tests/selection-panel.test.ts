// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SelectionPanel from '../src/components/SelectionPanel.vue'

afterEach(() => {
  vi.restoreAllMocks()
  delete (HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void }).showModal
  delete (HTMLDialogElement.prototype as HTMLDialogElement & { close?: () => void }).close
})

describe('SelectionPanel', () => {
  it('keeps summary fields visible and opens all remaining fields in Details', async () => {
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true
    })
    const close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false
    })
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: showModal,
    })
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: close,
    })
    const wrapper = mount(SelectionPanel, {
      props: {
        name: 'TRAPPIST-1',
        originName: 'Sol',
        summaryFields: [
          ['Distance from origin', '40.7 ly / 1,284.394 lMs'],
          ['System diameter', '1,278.45 ls'],
        ],
        detailFields: [['Gaia source ID', '2635476908753563008']],
      },
    })

    expect(wrapper.get('.selected-source-panel').exists()).toBe(true)
    expect(wrapper.find('section > dl').text()).toContain('Distance from origin')
    expect(wrapper.find('section > dl').text()).toContain('40.7 ly / 1,284.394 lMs')
    await wrapper.get('.origin-distance-label button').trigger('click')
    expect(wrapper.get('.origin-distance-label [role="tooltip"]').text()).toBe('Map origin: Sol')
    await wrapper.get('.system-diameter-label button').trigger('click')
    expect(wrapper.get('.system-diameter-label [role="tooltip"]').text()).toContain('largest known planetary apoastron')
    expect(wrapper.find('section > dl').text()).toContain('1,278.45 ls')
    expect(wrapper.find('section > dl').text()).not.toContain('Gaia source ID')

    await wrapper.get('.selection-details-link').trigger('click')

    expect(showModal).toHaveBeenCalledOnce()
    expect(wrapper.get('dialog').attributes('open')).toBeDefined()
    expect(wrapper.get('dialog').text()).toContain('Gaia source ID')

    await wrapper.get('.selection-details-close').trigger('click')

    expect(close).toHaveBeenCalledOnce()
    expect(wrapper.get('dialog').attributes('open')).toBeUndefined()
  })

  it('emits the appropriate permanent-label action for the selected source', async () => {
    const wrapper = mount(SelectionPanel, {
      props: {
        name: 'TRAPPIST-1',
        summaryFields: [],
        detailFields: [],
        labelAction: 'add',
      },
    })

    await wrapper.get('.label-action').trigger('click')
    expect(wrapper.emitted('openLabelMenu')).toHaveLength(1)

    await wrapper.setProps({ labelAction: 'remove' })
    await wrapper.get('.label-action').trigger('click')
    expect(wrapper.emitted('requestLabelRemoval')).toHaveLength(1)
  })
})
