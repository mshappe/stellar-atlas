// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CatalogControls from '../src/components/CatalogControls.vue'

describe('CatalogControls', () => {
  it('represents an imported catalog instead of selecting an unrelated bundled catalog', () => {
    const wrapper = mount(CatalogControls, {
      props: {
        selectedCatalogKey: undefined,
        hideUnlabeledStars: false,
        importStatus: 'Ready.',
        labelCatalogStatus: '',
      },
    })

    expect((wrapper.get('#catalog-mode').element as HTMLSelectElement).value).toBe('')
    expect(wrapper.text()).toContain('Imported Gaia DR3 CSV')
  })
})
