// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LabelCurationPanel from '../src/components/LabelCurationPanel.vue'

describe('LabelCurationPanel', () => {
  it('offers GitHub sign-in to unauthenticated visitors', async () => {
    const wrapper = mount(LabelCurationPanel, {
      props: {
        session: { authenticated: false, maintainer: false },
        sourceId: undefined,
        existingLabel: undefined,
        candidates: undefined,
        status: '',
      },
    })

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('signIn')).toHaveLength(1)
  })

  it('submits only a displayed verified candidate for a selected source', async () => {
    const wrapper = mount(LabelCurationPanel, {
      props: {
        session: { authenticated: true, maintainer: true, login: 'mshappe' },
        sourceId: '1234567890123456789',
        existingLabel: undefined,
        candidates: {
          sourceId: '1234567890123456789',
          candidates: [{
            displayLabel: 'Verified Host',
            authority: 'NASA Exoplanet Archive hostname',
          }],
        },
        status: '',
      },
    })

    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('create')).toEqual([['1234567890123456789', 'Verified Host']])
  })

  it('does not offer curation when the selected source already has a permanent label', () => {
    const wrapper = mount(LabelCurationPanel, {
      props: {
        session: { authenticated: true, maintainer: true, login: 'mshappe' },
        sourceId: '1234567890123456789',
        existingLabel: 'Verified Host',
        candidates: undefined,
        status: '',
      },
    })

    expect(wrapper.text()).toContain('already permanently labeled as Verified Host')
    expect(wrapper.text()).toContain('Signed in as mshappe.')
    expect(wrapper.find('form').exists()).toBe(false)
  })
})
