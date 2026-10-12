// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ReferenceFramePanel from '../src/components/ReferenceFramePanel.vue'

describe('ReferenceFramePanel', () => {
  it('keeps reference information behind an accessible dialog trigger', async () => {
    const wrapper = mount(ReferenceFramePanel)

    expect(wrapper.get('.info-toggle').attributes('aria-label')).toBe('Open reference frame information')
    expect(wrapper.get('.reference-frame-dialog').attributes('open')).toBeUndefined()

    await wrapper.get('.info-toggle').trigger('click')

    expect(wrapper.get('.reference-frame-dialog').attributes('open')).toBeDefined()
    expect(wrapper.get('.reference-frame-dialog').text()).toContain('Astrometry epoch')
  })
})
