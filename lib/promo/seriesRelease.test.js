import { describe, test, expect } from 'bun:test'
import { buildReleaseCaption, buildReleaseCopy, ctaLabel, orderWorks, seriesPublicUrl, suggestMode, suggestType, worksLine } from './seriesRelease.js'

const series = { title: 'URBAN TOTEMS', name_es: 'Tótems urbanos', name_en: 'Urban Totems', editorial_status: 'active', launch_date: '2026-10-22T18:00:00Z' }

describe('series release studio rules', () => {
  test('launching soon suggests typographic mode', () => expect(suggestMode('LAUNCHING_SOON', 5)).toBe('typo'))
  test('3+ works suggests grid, fewer suggests hero', () => {
    expect(suggestMode('SERIES_DROP', 3)).toBe('grid')
    expect(suggestMode('SERIES_DROP', 2)).toBe('hero')
  })
  test('coming soon series suggests LAUNCHING_SOON', () => expect(suggestType({ editorial_status: 'coming_soon' })).toBe('LAUNCHING_SOON'))
  test('English uses English name; empty English falls back to Spanish', () => {
    expect(buildReleaseCopy({ series, type: 'SERIES_DROP', cta: 'EXPLORE_SERIES', lang: 'en', workCount: 2 }).name).toBe('Urban Totems')
    expect(buildReleaseCopy({ series: { ...series, name_en: '' }, type: 'SERIES_DROP', cta: 'EXPLORE_SERIES', lang: 'en', workCount: 2 }).name).toBe('Tótems urbanos')
  })
  test('English copy has no Spanish labels', () => {
    const c = buildReleaseCopy({ series, type: 'NOW_LIVE', cta: 'VIEW_WORKS', lang: 'en', workCount: 2 })
    expect([c.label, c.cta, c.works]).toEqual(['NOW LIVE', 'VIEW WORKS', '2 works'])
  })
  test('CTAs never say buy', () => {
    for (const k of ['EXPLORE_SERIES', 'VIEW_WORKS', 'DISCOVER_RELEASE', 'SEE_DROP', 'ENTER_SERIES', 'AVAILABLE_NOW']) expect(ctaLabel(k, 'en')).not.toMatch(/BUY/)
  })
  test('link goes to the existing series catalog view', () => expect(seriesPublicUrl(series)).toBe('https://www.josuebeltranuresti.com/catalog?series=URBAN%20TOTEMS'))
  test('caption includes the public URL', () => expect(buildReleaseCaption({ series, type: 'SERIES_DROP', lang: 'en', url: 'U' })).toContain('\nU\n'))
  test('main artwork first, then featured; works without image are skipped', () => {
    const w = [{ id: 1, primary_image_url: 'a' }, { id: 2, featured: true, primary_image_url: 'b' }, { id: 3, primary_image_url: 'c' }, { id: 4 }]
    expect(orderWorks(w, 3).map((x) => x.id)).toEqual([3, 2, 1])
  })
  test('works line', () => { expect(worksLine(1, 'es')).toBe('1 obra'); expect(worksLine(0, 'en')).toBe('') })
})
