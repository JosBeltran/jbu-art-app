import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getAnnouncementText } from './announcement.js'

const settings = {
  announcement_enabled: true,
  announcement_text_es: 'Envío nacional e internacional incluido',
  announcement_text_en: 'National and international shipping included',
}

test('sin configuración o desactivado no muestra nada', () => {
  assert.equal(getAnnouncementText(null, 'es'), '')
  assert.equal(getAnnouncementText({}, 'es'), '')
  assert.equal(getAnnouncementText({ ...settings, announcement_enabled: false }, 'es'), '')
})

test('usa el idioma activo del sitio', () => {
  assert.equal(getAnnouncementText(settings, 'es'), 'Envío nacional e internacional incluido')
  assert.equal(getAnnouncementText(settings, 'en'), 'National and international shipping included')
})

test('inglés vacío cae al español y recorta espacios', () => {
  assert.equal(getAnnouncementText({ ...settings, announcement_text_en: '  ' }, 'en'), settings.announcement_text_es)
  assert.equal(getAnnouncementText({ ...settings, announcement_text_es: '  Envío incluido  ' }, 'es'), 'Envío incluido')
})

test('sin español usa el inglés como último respaldo', () => {
  assert.equal(getAnnouncementText({ ...settings, announcement_text_es: '' }, 'es'), settings.announcement_text_en)
})
