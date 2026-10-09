// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
].join('\n')

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App label curation', () => {
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

    const wrapper = mount(App, {
      global: {
        stubs: {
          AtlasScene: { name: 'AtlasScene', props: ['permanentLabels'], template: '<div />' },
          CatalogControls: true,
          CatalogSearch: true,
          ReferenceFramePanel: true,
          RoutePanel: true,
          SelectionPanel: true,
        },
      },
    })
    await flushPromises()

    const scene = wrapper.findComponent({ name: 'AtlasScene' })
    scene.vm.$emit('focus', firstSource)
    await flushPromises()
    wrapper.findComponent({ name: 'LabelCurationPanel' }).vm.$emit('create', firstSource.sourceId, `Gaia DR3 ${firstSource.sourceId}`)
    await flushPromises()

    scene.vm.$emit('focus', secondSource)
    await flushPromises()
    labelCreated = true
    labelWrite.resolve(Response.json({ label: {} }))
    await flushPromises()

    const panel = wrapper.findComponent({ name: 'LabelCurationPanel' })
    expect(panel.props('sourceId')).toBe(secondSource.sourceId)
    expect(panel.props('status')).toBe('')
    expect(panel.text()).toContain(`Gaia DR3 ${secondSource.sourceId}`)
    expect(scene.props('permanentLabels')).toEqual({
      [firstSource.sourceId]: `Gaia DR3 ${firstSource.sourceId}`,
    })
  })
})
