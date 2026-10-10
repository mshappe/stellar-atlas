// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BUNDLED_CATALOGS } from '../src/atlas-data'
import type { GaiaRow } from '../src/atlas-types'
import App from '../src/App.vue'

const trappist: GaiaRow = {
  sourceId: '2635476908753563008',
  ra: 0,
  dec: 0,
  parallax: 100,
}

const firstSource: GaiaRow = {
  sourceId: '1234567890123456789',
  ra: 1,
  dec: 0,
  parallax: 100,
}

const secondSource: GaiaRow = {
  sourceId: '9876543210987654321',
  ra: 2,
  dec: 0,
  parallax: 100,
}

const catalogCsv = [
  'source_id,ra,dec,parallax',
  `${trappist.sourceId},${trappist.ra},${trappist.dec},${trappist.parallax}`,
  `${firstSource.sourceId},${firstSource.ra},${firstSource.dec},${firstSource.parallax}`,
  `${secondSource.sourceId},${secondSource.ra},${secondSource.dec},${secondSource.parallax}`,
  ...Array.from(
    { length: BUNDLED_CATALOGS['confirmed-hosts'].count - 3 },
    (_, index) => `${index + 10_000_000_000_000_000},3,0,100`,
  ),
].join('\n')

function mountApp() {
  return mount(App, {
    global: {
      stubs: {
        AtlasScene: {
          name: 'AtlasScene',
          props: ['permanentLabels', 'projectionEpoch'],
          template: '<div />',
        },
        CatalogControls: {
          name: 'CatalogControls',
          props: ['selectedCatalogKey', 'importStatus', 'projectionEpoch'],
          template: '<div />',
        },
        CatalogSearch: true,
        ReferenceFramePanel: true,
        RoutePanel: true,
        SelectionPanel: true,
      },
    },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App label curation', () => {
  it('retains the active catalog selection when a replacement catalog cannot load', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = String(input)
      if (url === '/api/labels') return Promise.resolve(Response.json({ labels: [] }))
      if (url === '/api/session') return Promise.resolve(Response.json({
        authenticated: false,
        maintainer: false,
      }))
      if (url.includes('gaia-dr3-confirmed-exoplanet-hosts')) return Promise.resolve(new Response(catalogCsv))
      if (url.includes('gaia-dr3-trappist-1-150ly.csv')) return Promise.resolve(new Response('', { status: 503 }))
      throw new Error(`Unexpected request: ${url}`)
    }))

    const wrapper = mountApp()
    await flushPromises()

    const controls = wrapper.findComponent({ name: 'CatalogControls' })
    expect(controls.props('selectedCatalogKey')).toBe('confirmed-hosts')
    controls.vm.$emit('changeProjectionEpoch', 5026)
    await flushPromises()
    controls.vm.$emit('changeCatalog', 'all-stars')
    await flushPromises()

    expect(controls.props('selectedCatalogKey')).toBe('confirmed-hosts')
    expect(controls.props('importStatus')).toContain('could not be loaded')
    expect(controls.props('projectionEpoch')).toBe(5026)
  })

  it('rejects out-of-range projection epochs at the application state boundary', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = String(input)
      if (url === '/api/labels') return Promise.resolve(Response.json({ labels: [] }))
      if (url === '/api/session') return Promise.resolve(Response.json({
        authenticated: false,
        maintainer: false,
      }))
      if (url.includes('gaia-dr3-confirmed-exoplanet-hosts')) return Promise.resolve(new Response(catalogCsv))
      throw new Error(`Unexpected request: ${url}`)
    }))

    const wrapper = mountApp()
    await flushPromises()

    const controls = wrapper.findComponent({ name: 'CatalogControls' })
    controls.vm.$emit('changeProjectionEpoch', 5025)
    await flushPromises()
    expect(controls.props('projectionEpoch')).toBeUndefined()

    controls.vm.$emit('changeProjectionEpoch', 5527)
    await flushPromises()
    expect(controls.props('projectionEpoch')).toBeUndefined()
  })

  it('clears a selected source that projected rendering excludes', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = String(input)
      if (url === '/api/labels') return Promise.resolve(Response.json({ labels: [] }))
      if (url === '/api/session') return Promise.resolve(Response.json({
        authenticated: false,
        maintainer: false,
      }))
      if (url.includes('gaia-dr3-confirmed-exoplanet-hosts')) return Promise.resolve(new Response(catalogCsv))
      throw new Error(`Unexpected request: ${url}`)
    }))

    const wrapper = mountApp()
    await flushPromises()

    const scene = wrapper.findComponent({ name: 'AtlasScene' })
    scene.vm.$emit('focus', firstSource)
    await flushPromises()
    expect(wrapper.findComponent({ name: 'LabelCurationPanel' }).props('sourceId')).toBe(firstSource.sourceId)

    wrapper.findComponent({ name: 'CatalogControls' }).vm.$emit('changeProjectionEpoch', 5026)
    await flushPromises()
    expect(wrapper.findComponent({ name: 'LabelCurationPanel' }).props('sourceId')).toBeUndefined()
  })

  it('does not overwrite a newly selected source with a prior label-write completion', async () => {
    const labelWrite = Promise.withResolvers<Response>()
    let labelCreated = false
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/labels' && init?.method === 'POST') return labelWrite.promise
      if (url === '/api/labels') {
        return Promise.resolve(Response.json({
          labels: labelCreated ? [{
            gaiaSourceId: firstSource.sourceId,
            displayLabel: `Gaia DR3 ${firstSource.sourceId}`,
          }] : [],
        }))
      }
      if (url === '/api/session') return Promise.resolve(Response.json({
        authenticated: true,
        maintainer: true,
        login: 'mshappe',
      }))
      if (url.includes('gaia-dr3-confirmed-exoplanet-hosts')) return Promise.resolve(new Response(catalogCsv))
      if (url.includes(secondSource.sourceId)) {
        return Promise.resolve(Response.json({
          sourceId: secondSource.sourceId,
          candidates: [{
            displayLabel: `Gaia DR3 ${secondSource.sourceId}`,
            authority: 'Gaia DR3 source ID',
          }],
        }))
      }
      if (url.includes(firstSource.sourceId)) {
        return Promise.resolve(Response.json({
          sourceId: firstSource.sourceId,
          candidates: [{
            displayLabel: `Gaia DR3 ${firstSource.sourceId}`,
            authority: 'Gaia DR3 source ID',
          }],
        }))
      }
      throw new Error(`Unexpected request: ${url}`)
    }))

    const wrapper = mountApp()
    await flushPromises()

    const scene = wrapper.findComponent({ name: 'AtlasScene' })
    scene.vm.$emit('focus', firstSource)
    await flushPromises()
    wrapper.findComponent({ name: 'LabelCurationPanel' }).vm.$emit('create', firstSource.sourceId, `Gaia DR3 ${firstSource.sourceId}`)
    await flushPromises()

    scene.vm.$emit('focus', secondSource)
    await flushPromises()
    labelCreated = true
    labelWrite.resolve(Response.json({
      label: {
        gaiaSourceId: firstSource.sourceId,
        displayLabel: `Gaia DR3 ${firstSource.sourceId}`,
      },
    }, { status: 201 }))
    await flushPromises()

    const panel = wrapper.findComponent({ name: 'LabelCurationPanel' })
    expect(panel.props('sourceId')).toBe(secondSource.sourceId)
    expect(panel.props('candidateError')).toBe('')
    expect(panel.text()).toContain(`Gaia DR3 ${secondSource.sourceId}`)
    expect(scene.props('permanentLabels')).toEqual({
      [firstSource.sourceId]: `Gaia DR3 ${firstSource.sourceId}`,
    })
  })

  it('retries a failed candidate request for the selected source', async () => {
    let candidateRequests = 0
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = String(input)
      if (url === '/api/labels') return Promise.resolve(Response.json({ labels: [] }))
      if (url === '/api/session') return Promise.resolve(Response.json({
        authenticated: true,
        maintainer: true,
        login: 'mshappe',
      }))
      if (url.includes('gaia-dr3-confirmed-exoplanet-hosts')) return Promise.resolve(new Response(catalogCsv))
      if (url.includes(firstSource.sourceId)) {
        candidateRequests += 1
        if (candidateRequests === 1) return Promise.resolve(new Response('', { status: 503 }))
        return Promise.resolve(Response.json({
          sourceId: firstSource.sourceId,
          candidates: [{
            displayLabel: `Gaia DR3 ${firstSource.sourceId}`,
            authority: 'Gaia DR3 source ID',
          }],
        }))
      }
      throw new Error(`Unexpected request: ${url}`)
    }))

    const wrapper = mountApp()
    await flushPromises()

    wrapper.findComponent({ name: 'AtlasScene' }).vm.$emit('focus', firstSource)
    await flushPromises()

    const panel = wrapper.findComponent({ name: 'LabelCurationPanel' })
    expect(panel.props('candidateError')).toContain('unavailable')
    panel.vm.$emit('retryCandidates')
    await flushPromises()

    expect(candidateRequests).toBe(2)
    expect(panel.props('candidates')).toMatchObject({ sourceId: firstSource.sourceId })
    expect(panel.props('candidateError')).toBe('')
  })

  it('restores the candidate form after a label-write failure', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/labels' && init?.method === 'POST') {
        return Promise.resolve(Response.json({ error: 'Candidate is no longer valid.' }, { status: 422 }))
      }
      if (url === '/api/labels') return Promise.resolve(Response.json({ labels: [] }))
      if (url === '/api/session') return Promise.resolve(Response.json({
        authenticated: true,
        maintainer: true,
        login: 'mshappe',
      }))
      if (url.includes('gaia-dr3-confirmed-exoplanet-hosts')) return Promise.resolve(new Response(catalogCsv))
      if (url.includes(firstSource.sourceId)) return Promise.resolve(Response.json({
        sourceId: firstSource.sourceId,
        candidates: [{
          displayLabel: `Gaia DR3 ${firstSource.sourceId}`,
          authority: 'Gaia DR3 source ID',
        }],
      }))
      throw new Error(`Unexpected request: ${url}`)
    }))

    const wrapper = mountApp()
    await flushPromises()

    wrapper.findComponent({ name: 'AtlasScene' }).vm.$emit('focus', firstSource)
    await flushPromises()
    const panel = wrapper.findComponent({ name: 'LabelCurationPanel' })
    panel.vm.$emit('create', firstSource.sourceId, `Gaia DR3 ${firstSource.sourceId}`)
    await flushPromises()

    expect(panel.props('creationError')).toContain('could not be created')
    expect(panel.props('creatingLabel')).toBe(false)
    expect(panel.find('form').exists()).toBe(true)
  })

  it('keeps a successfully created label when catalog reconciliation fails', async () => {
    let labelCatalogRequests = 0
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/labels' && init?.method === 'POST') {
        return Promise.resolve(Response.json({
          label: {
            gaiaSourceId: firstSource.sourceId,
            displayLabel: `Gaia DR3 ${firstSource.sourceId}`,
          },
        }, { status: 201 }))
      }
      if (url === '/api/labels') {
        labelCatalogRequests += 1
        return Promise.resolve(labelCatalogRequests === 1
          ? Response.json({ labels: [] })
          : new Response('', { status: 503 }))
      }
      if (url === '/api/session') return Promise.resolve(Response.json({
        authenticated: true,
        maintainer: true,
        login: 'mshappe',
      }))
      if (url.includes('gaia-dr3-confirmed-exoplanet-hosts')) return Promise.resolve(new Response(catalogCsv))
      if (url.includes(firstSource.sourceId)) return Promise.resolve(Response.json({
        sourceId: firstSource.sourceId,
        candidates: [{
          displayLabel: `Gaia DR3 ${firstSource.sourceId}`,
          authority: 'Gaia DR3 source ID',
        }],
      }))
      throw new Error(`Unexpected request: ${url}`)
    }))

    const wrapper = mountApp()
    await flushPromises()

    wrapper.findComponent({ name: 'AtlasScene' }).vm.$emit('focus', firstSource)
    await flushPromises()
    const panel = wrapper.findComponent({ name: 'LabelCurationPanel' })
    panel.vm.$emit('create', firstSource.sourceId, `Gaia DR3 ${firstSource.sourceId}`)
    await flushPromises()

    expect(wrapper.findComponent({ name: 'AtlasScene' }).props('permanentLabels')).toEqual({
      [firstSource.sourceId]: `Gaia DR3 ${firstSource.sourceId}`,
    })
    expect(panel.props('existingLabel')).toBe(`Gaia DR3 ${firstSource.sourceId}`)
    expect(panel.find('form').exists()).toBe(false)
  })

  it('does not let an earlier catalog request overwrite a created label', async () => {
    const initialCatalog = Promise.withResolvers<Response>()
    let labelCatalogRequests = 0
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/labels' && init?.method === 'POST') {
        return Promise.resolve(Response.json({
          label: {
            gaiaSourceId: firstSource.sourceId,
            displayLabel: `Gaia DR3 ${firstSource.sourceId}`,
          },
        }, { status: 201 }))
      }
      if (url === '/api/labels') {
        labelCatalogRequests += 1
        if (labelCatalogRequests === 1) return initialCatalog.promise
        return Promise.resolve(Response.json({
          labels: [{
            gaiaSourceId: firstSource.sourceId,
            displayLabel: `Gaia DR3 ${firstSource.sourceId}`,
          }],
        }))
      }
      if (url === '/api/session') return Promise.resolve(Response.json({
        authenticated: true,
        maintainer: true,
        login: 'mshappe',
      }))
      if (url.includes('gaia-dr3-confirmed-exoplanet-hosts')) return Promise.resolve(new Response(catalogCsv))
      if (url.includes(firstSource.sourceId)) return Promise.resolve(Response.json({
        sourceId: firstSource.sourceId,
        candidates: [{
          displayLabel: `Gaia DR3 ${firstSource.sourceId}`,
          authority: 'Gaia DR3 source ID',
        }],
      }))
      throw new Error(`Unexpected request: ${url}`)
    }))

    const wrapper = mountApp()
    await flushPromises()
    wrapper.findComponent({ name: 'AtlasScene' }).vm.$emit('focus', firstSource)
    await flushPromises()
    wrapper.findComponent({ name: 'LabelCurationPanel' }).vm.$emit('create', firstSource.sourceId, `Gaia DR3 ${firstSource.sourceId}`)
    await flushPromises()
    initialCatalog.resolve(Response.json({ labels: [] }))
    await flushPromises()

    expect(wrapper.findComponent({ name: 'AtlasScene' }).props('permanentLabels')).toEqual({
      [firstSource.sourceId]: `Gaia DR3 ${firstSource.sourceId}`,
    })
  })

  it('does not submit another write while the selected source is already creating a label', async () => {
    const labelWrite = Promise.withResolvers<Response>()
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/labels' && init?.method === 'POST') return labelWrite.promise
      if (url === '/api/labels') return Promise.resolve(Response.json({ labels: [] }))
      if (url === '/api/session') return Promise.resolve(Response.json({
        authenticated: true,
        maintainer: true,
        login: 'mshappe',
      }))
      if (url.includes('gaia-dr3-confirmed-exoplanet-hosts')) return Promise.resolve(new Response(catalogCsv))
      if (url.includes(firstSource.sourceId)) return Promise.resolve(Response.json({
        sourceId: firstSource.sourceId,
        candidates: [{
          displayLabel: `Gaia DR3 ${firstSource.sourceId}`,
          authority: 'Gaia DR3 source ID',
        }],
      }))
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountApp()
    await flushPromises()
    wrapper.findComponent({ name: 'AtlasScene' }).vm.$emit('focus', firstSource)
    await flushPromises()
    const panel = wrapper.findComponent({ name: 'LabelCurationPanel' })
    panel.vm.$emit('create', firstSource.sourceId, `Gaia DR3 ${firstSource.sourceId}`)
    panel.vm.$emit('create', firstSource.sourceId, `Gaia DR3 ${firstSource.sourceId}`)
    await flushPromises()

    expect(fetchMock.mock.calls.filter(([input, init]) => (
      String(input) === '/api/labels' && init?.method === 'POST'
    ))).toHaveLength(1)
    labelWrite.resolve(Response.json({
      label: {
        gaiaSourceId: firstSource.sourceId,
        displayLabel: `Gaia DR3 ${firstSource.sourceId}`,
      },
    }, { status: 201 }))
    await flushPromises()
  })
})
