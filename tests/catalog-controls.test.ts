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
        projectionEpoch: undefined,
      },
    })

    expect((wrapper.get('#catalog-mode').element as HTMLSelectElement).value).toBe('')
    expect(wrapper.text()).toContain('Imported Gaia DR3 CSV')
  })

  it('emits bounded projected epochs and explicitly restores the catalog epoch', async () => {
    const wrapper = mount(CatalogControls, {
      props: {
        selectedCatalogKey: 'confirmed-hosts',
        hideUnlabeledStars: false,
        importStatus: 'Ready.',
        labelCatalogStatus: '',
        projectionEpoch: 5026,
      },
    })

    await wrapper.get('#projection-epoch').setValue(5526)
    expect(wrapper.emitted('changeProjectionEpoch')).toContainEqual([5526])

    await wrapper.get('button.measure-clear').trigger('click')
    expect(wrapper.emitted('changeProjectionEpoch')).toContainEqual([undefined])
  })
})
