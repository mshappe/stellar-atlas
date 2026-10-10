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
        summaryFields: [['Distance from map origin (ly)', '40.7']],
        detailFields: [['Gaia source ID', '2635476908753563008']],
      },
    })

    expect(wrapper.find('section > dl').text()).toContain('Distance from map origin (ly)')
    expect(wrapper.find('section > dl').text()).not.toContain('Gaia source ID')

    await wrapper.get('.selection-details-link').trigger('click')

    expect(showModal).toHaveBeenCalledOnce()
    expect(wrapper.get('dialog').attributes('open')).toBeDefined()
    expect(wrapper.get('dialog').text()).toContain('Gaia source ID')

    await wrapper.get('.selection-details-close').trigger('click')

    expect(close).toHaveBeenCalledOnce()
    expect(wrapper.get('dialog').attributes('open')).toBeUndefined()
  })
})
