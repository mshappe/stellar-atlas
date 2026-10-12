// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RoutePanel from '../src/components/RoutePanel.vue'

describe('RoutePanel', () => {
  it('marks its root for persistent sidebar separation', () => {
    const wrapper = mount(RoutePanel, {
      props: {
        status: 'Select a first star, then a second star.',
        fields: [],
        hops: [],
        hasEndpoints: false,
      },
    })

    expect(wrapper.get('.route-panel').exists()).toBe(true)
  })

  it('moves completed-route context into the header tooltip', () => {
    const wrapper = mount(RoutePanel, {
      props: {
        status: '',
        tooltip: 'Overall travel distance from the displayed Gaia coordinates.',
        fields: [['Overall distance', '0.569 ly / 17.958 lMs']],
        hops: [],
        hasEndpoints: true,
      },
    })

    expect(wrapper.get('.route-tooltip-label').attributes('title'))
      .toBe('Overall travel distance from the displayed Gaia coordinates.')
    expect(wrapper.find('.status').exists()).toBe(false)
  })
})
