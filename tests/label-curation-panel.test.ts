// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import LabelCurationPanel from '../src/components/LabelCurationPanel.vue'

const defaultProps = {
  open: false,
  removalOpen: false,
  session: { authenticated: true, maintainer: true, login: 'mshappe' },
  sourceId: '1234567890123456789',
  sourceName: 'Verified Host',
  existingLabel: undefined,
  candidates: undefined,
  sessionStatus: '',
  candidateError: '',
  creationError: '',
  retirementError: '',
  logoutError: '',
  loadingCandidates: false,
  creatingLabel: false,
  retiringLabel: false,
  signingOut: false,
}

describe('LabelCurationPanel', () => {
  it('offers GitHub sign-in to unauthenticated visitors', async () => {
    const wrapper = mount(LabelCurationPanel, {
      props: {
        ...defaultProps,
        session: { authenticated: false, maintainer: false },
        sourceId: undefined,
      },
    })

    await wrapper.get('.measure-clear').trigger('click')

    expect(wrapper.emitted('signIn')).toHaveLength(1)
  })

  it('submits only a displayed verified candidate for a selected source', async () => {
    const wrapper = mount(LabelCurationPanel, {
      props: {
        ...defaultProps,
        candidates: {
          sourceId: '1234567890123456789',
          candidates: [{
            displayLabel: 'Verified Host',
            authority: 'NASA Exoplanet Archive hostname',
          }],
        },
      },
    })

    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('create')).toEqual([['1234567890123456789', 'Verified Host']])
  })

  it('offers authenticated maintainers a sign-out action', async () => {
    const wrapper = mount(LabelCurationPanel, { props: defaultProps })
    const signOut = wrapper.findAll('button').find((button) => button.text() === 'Sign out')

    expect(signOut).toBeDefined()
    await signOut?.trigger('click')

    expect(wrapper.emitted('signOut')).toHaveLength(1)
  })

  it('opens a native dialog for label candidates', async () => {
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true
    })
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: showModal,
    })
    const wrapper = mount(LabelCurationPanel, {
      props: defaultProps,
    })

    await wrapper.setProps({ open: true })
    await wrapper.vm.$nextTick()

    expect(showModal).toHaveBeenCalledOnce()
    expect(wrapper.get('.label-curation-dialog').attributes('open')).toBeDefined()
    delete (HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void }).showModal
  })

  it('confirms permanent-label removal before emitting a retirement request', async () => {
    const wrapper = mount(LabelCurationPanel, {
      props: {
        ...defaultProps,
        existingLabel: 'Verified Host',
      },
    })

    expect(wrapper.text()).toContain('Remove Verified Host as the permanent label')
    await wrapper.get('.label-removal-confirm').trigger('click')

    expect(wrapper.emitted('retire')).toHaveLength(1)
  })

  it('requires an authenticated maintainer before offering label removal', async () => {
    const wrapper = mount(LabelCurationPanel, {
      props: {
        ...defaultProps,
        existingLabel: 'Verified Host',
        session: { authenticated: false, maintainer: false },
      },
    })

    expect(wrapper.find('.label-removal-confirm').exists()).toBe(false)
    await wrapper.get('.measure-clear').trigger('click')
    expect(wrapper.emitted('signIn')).toHaveLength(1)

    await wrapper.setProps({ session: { authenticated: true, maintainer: false, login: 'reader' } })
    expect(wrapper.find('.label-removal-confirm').exists()).toBe(false)
    expect(wrapper.text()).toContain('cannot curate permanent labels')
  })

  it('announces session errors and offers candidate retries without hiding a label-write form', async () => {
    const sessionError = mount(LabelCurationPanel, {
      props: {
        ...defaultProps,
        session: undefined,
        sourceId: undefined,
        sessionStatus: 'Maintainer session is unavailable.',
      },
    })
    expect(sessionError.get('[role="status"]').text()).toContain('Maintainer session is unavailable.')

    const wrapper = mount(LabelCurationPanel, {
      props: {
        ...defaultProps,
        candidates: {
          sourceId: '1234567890123456789',
          candidates: [{
            displayLabel: 'Verified Host',
            authority: 'NASA Exoplanet Archive hostname',
          }],
        },
        candidateError: 'Verified label candidates are unavailable.',
        creationError: 'Permanent label could not be created.',
      },
    })

    await wrapper.get('.measure-clear').trigger('click')

    expect(wrapper.emitted('retryCandidates')).toHaveLength(1)
    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.text()).toContain('Permanent label could not be created.')
  })
})
