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
        sessionStatus: '',
        candidateError: '',
        creationError: '',
        loadingCandidates: false,
        creatingLabel: false,
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
        sessionStatus: '',
        candidateError: '',
        creationError: '',
        loadingCandidates: false,
        creatingLabel: false,
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
        sessionStatus: '',
        candidateError: '',
        creationError: '',
        loadingCandidates: false,
        creatingLabel: false,
      },
    })

    expect(wrapper.text()).toContain('already permanently labeled as Verified Host')
    expect(wrapper.text()).toContain('Signed in as mshappe.')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('announces session errors and offers candidate retries without hiding a label-write form', async () => {
    const sessionError = mount(LabelCurationPanel, {
      props: {
        session: undefined,
        sourceId: undefined,
        existingLabel: undefined,
        candidates: undefined,
        sessionStatus: 'Maintainer session is unavailable.',
        candidateError: '',
        creationError: '',
        loadingCandidates: false,
        creatingLabel: false,
      },
    })
    expect(sessionError.get('[role="status"]').text()).toContain('Maintainer session is unavailable.')

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
        sessionStatus: '',
        candidateError: 'Verified label candidates are unavailable.',
        creationError: 'Permanent label could not be created.',
        loadingCandidates: false,
        creatingLabel: false,
      },
    })

    await wrapper.get('button[type="button"]').trigger('click')

    expect(wrapper.emitted('retryCandidates')).toHaveLength(1)
    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.text()).toContain('Permanent label could not be created.')
  })
})
