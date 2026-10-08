import { describe, expect, it } from 'vitest'
import { parseGaiaCsv } from '../src/gaia-csv'

describe('parseGaiaCsv', () => {
  it('treats missing trailing optional cells as absent', () => {
    const catalog = parseGaiaCsv([
      'source_id,ra,dec,parallax,phot_g_mean_mag,host_names',
      '123,1,2,10',
    ].join('\n'))

    expect(catalog.rows).toEqual([{
      sourceId: '123',
      ra: 1,
      dec: 2,
      parallax: 10,
      parallaxError: undefined,
      raError: undefined,
      decError: undefined,
      magnitude: undefined,
      bpRp: undefined,
      hostNames: undefined,
      planetCount: undefined,
      planetNames: undefined,
      discoveryMethods: undefined,
      evidence: undefined,
      knownSystemDiameterAu: undefined,
      knownSystemDiameterLightSeconds: undefined,
      sourceCategory: undefined,
    }])
  })
})
