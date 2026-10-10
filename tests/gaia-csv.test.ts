import { existsSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseGaiaCsv } from '../src/gaia-csv'

describe('parseGaiaCsv', () => {
  it('keeps larger source catalogs out of Vite public output', () => {
    const publicFiles = readdirSync(new URL('../public', import.meta.url))

    expect(publicFiles).not.toContain('gaia-dr3-trappist-1-300ly.csv')
    expect(publicFiles).not.toContain('gaia-dr3-confirmed-exoplanet-hosts-trappist-1-300ly.csv')
    expect(existsSync(new URL('../data/source-catalogs/gaia-dr3-trappist-1-300ly.csv', import.meta.url))).toBe(true)
    expect(existsSync(new URL('../data/source-catalogs/gaia-dr3-confirmed-exoplanet-hosts-trappist-1-300ly.csv', import.meta.url))).toBe(true)
  })

  it('treats missing trailing optional cells as absent', () => {
    const catalog = parseGaiaCsv([
      'source_id,ra,dec,parallax,phot_g_mean_mag,host_names',
      '123,1,2,10',
    ].join('\n'))

    expect(catalog.rows).toMatchObject([{
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

  it('preserves Gaia kinematics, correlations, and quality flags when supplied', () => {
    const catalog = parseGaiaCsv([
      'source_id,ra,dec,parallax,astrometric_params_solved,pmra,pmra_error,pmdec,pmdec_error,radial_velocity,radial_velocity_error,radial_velocity_source,radial_velocity_quality,radial_velocity_bibliography_code,ruwe,duplicated_source,nss_tables,ra_dec_corr,ra_parallax_corr,ra_pmra_corr,ra_pmdec_corr,dec_parallax_corr,dec_pmra_corr,dec_pmdec_corr,parallax_pmra_corr,parallax_pmdec_corr,pmra_pmdec_corr',
      '123,1,2,10,31,3,0.1,4,0.2,5,0.3,SIMBAD,A,2020AJ....160..120J,1.02,false,gaiadr3.nss_two_body_orbit,0.01,0.02,0.03,0.04,0.05,0.06,0.07,0.08,0.09,0.1',
    ].join('\n'))

    expect(catalog.rows[0]).toMatchObject({
      astrometricParamsSolved: 31,
      pmra: 3,
      pmraError: 0.1,
      pmdec: 4,
      pmdecError: 0.2,
      radialVelocity: 5,
      radialVelocityError: 0.3,
      radialVelocitySource: 'SIMBAD',
      radialVelocityQuality: 'A',
      radialVelocityBibliographyCode: '2020AJ....160..120J',
      nssTables: 'gaiadr3.nss_two_body_orbit',
      ruwe: 1.02,
      duplicatedSource: false,
      raDecCorrelation: 0.01,
      pmraPmdecCorrelation: 0.1,
    })
  })
})
