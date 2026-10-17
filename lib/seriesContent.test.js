import { describe, test, expect } from 'bun:test'
import { getLocalizedSeriesContent, localizedSeriesName, hasSeriesName } from './seriesContent.js'

const both = { title: 'FLOW', name_es: 'Flujo', name_en: 'Flow', subtitle_es: 'Sub ES', subtitle_en: 'Sub EN', short_description_es: 'Corta', short_description_en: 'Short', description_es: 'Larga', description_en: 'Long' }
const legacy = { title: 'ORBITALS', home_subtitle: 'Órbitas', home_description: 'Breve', description: 'Texto' }

describe('series bilingual content', () => {
  test('ES+EN: Spanish shows Spanish', () => expect(getLocalizedSeriesContent(both, 'es').name).toBe('Flujo'))
  test('ES+EN: English shows English', () => {
    const c = getLocalizedSeriesContent(both, 'en')
    expect([c.name, c.subtitle, c.shortDescription, c.description]).toEqual(['Flow', 'Sub EN', 'Short', 'Long'])
  })
  test('legacy only: Spanish uses legacy fields', () => {
    const c = getLocalizedSeriesContent(legacy, 'es')
    expect([c.name, c.subtitle, c.shortDescription, c.description]).toEqual(['ORBITALS', 'Órbitas', 'Breve', 'Texto'])
  })
  test('legacy only: English falls back to Spanish, never blank', () => expect(getLocalizedSeriesContent(legacy, 'en').name).toBe('ORBITALS'))
  test('blank English field falls back to Spanish', () => expect(getLocalizedSeriesContent({ ...both, name_en: '  ' }, 'en').name).toBe('Flujo'))
  test('catalog filter label localized by artwork series name', () => {
    expect(localizedSeriesName('flow', [both], 'en')).toBe('Flow')
    expect(localizedSeriesName('flow', [both], 'es')).toBe('Flujo')
    expect(localizedSeriesName('UNKNOWN', [both], 'en')).toBe('UNKNOWN')
  })
  test('name required in at least one language', () => {
    expect(hasSeriesName({ name_es: '', name_en: '' })).toBe(false)
    expect(hasSeriesName({ name_es: 'Flujo', name_en: '' })).toBe(true)
  })
})
