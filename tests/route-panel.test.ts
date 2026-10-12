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
})
