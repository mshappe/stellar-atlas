import { describe, expect, it } from 'vitest'
import { addPersistentLabel, parseLabelCatalog, parsePersistentLabelCatalog } from '../src/label-catalog'

describe('parseLabelCatalog', () => {
  it('extracts permanent labels from provenance records', () => {
    const catalog = parseLabelCatalog({
      labels: [
        {
          gaia_dr3_source_id: '2635476908753563008',
          display_label: 'TRAPPIST-1',
        },
      ],
    })

    expect(catalog.labelsBySourceId).toEqual({
      '2635476908753563008': 'TRAPPIST-1',
    })
    expect(catalog.sourceIds).toEqual(new Set(['2635476908753563008']))
  })

  it('extracts persistent labels from the API response', () => {
    expect(parsePersistentLabelCatalog({
      labels: [{
        gaiaSourceId: '2635476908753563008',
        displayLabel: 'TRAPPIST-1',
        origin: 'seed',
      }],
    }).labelsBySourceId).toEqual({
      '2635476908753563008': 'TRAPPIST-1',
    })
  })

  it('adds a server-confirmed persistent label to the current catalog', () => {
    const catalog = parseLabelCatalog({
      labels: [{
        gaia_dr3_source_id: '2635476908753563008',
        display_label: 'TRAPPIST-1',
      }],
    })

    expect(addPersistentLabel(catalog, {
      gaiaSourceId: '1234567890123456789',
      displayLabel: 'Verified Host',
    }).labelsBySourceId).toEqual({
      '2635476908753563008': 'TRAPPIST-1',
      '1234567890123456789': 'Verified Host',
    })
  })

  it.each([
    [{}, 'must contain a labels array'],
    [{ labels: [{ gaia_dr3_source_id: 'not-a-gaia-id', display_label: 'Example' }] }, 'invalid Gaia DR3 source ID'],
    [{ labels: [{ gaia_dr3_source_id: '123', display_label: ' ' }] }, 'empty display label'],
    [{
      labels: [
        { gaia_dr3_source_id: '123', display_label: 'First' },
        { gaia_dr3_source_id: '123', display_label: 'Second' },
      ],
    }, 'duplicate Gaia DR3 source ID'],
  ])('rejects malformed label data', (value, message) => {
    expect(() => parseLabelCatalog(value)).toThrow(message)
  })
})
