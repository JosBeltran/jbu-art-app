import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolvePrimaryArtist,
  artistField,
  splitParagraphs,
  isValidHttpUrl,
  isValidEmail,
  validateArtistProfile,
  aboutMetaTitle,
  aboutMetaDescription,
} from './artistProfile.js'

const artist = {
  profile_id: 'a1',
  display_name: 'Josué Beltrán Uresti',
  location_es: 'Monterrey, Nuevo León, México',
  location_en: 'Monterrey, Nuevo León, Mexico',
  about_title_es: 'Sobre mi práctica',
  about_title_en: 'About my practice',
  biography_es: 'Párrafo uno.\n\nPárrafo dos.',
  biography_en: '',
  about_enabled: true,
}

test('resolvePrimaryArtist devuelve el artista configurado y activado', () => {
  assert.equal(resolvePrimaryArtist({ settings: { primary_artist_profile_id: 'a1' }, artists: [artist] }), artist)
})

test('resolvePrimaryArtist sin configuración devuelve null', () => {
  assert.equal(resolvePrimaryArtist({ settings: {}, artists: [artist] }), null)
  assert.equal(resolvePrimaryArtist({ settings: null, artists: [artist] }), null)
})

test('resolvePrimaryArtist ignora perfiles con About desactivado u otros artistas', () => {
  assert.equal(resolvePrimaryArtist({ settings: { primary_artist_profile_id: 'a1' }, artists: [{ ...artist, about_enabled: false }] }), null)
  assert.equal(resolvePrimaryArtist({ settings: { primary_artist_profile_id: 'otro' }, artists: [artist] }), null)
})

test('artistField usa inglés cuando existe y cae al español si falta', () => {
  assert.equal(artistField(artist, 'about_title', 'en'), 'About my practice')
  assert.equal(artistField(artist, 'biography', 'en'), artist.biography_es)
  assert.equal(artistField(artist, 'location', 'es'), artist.location_es)
  assert.equal(artistField(null, 'biography', 'es'), '')
})

test('splitParagraphs separa por líneas en blanco y une saltos simples', () => {
  const text = 'Uno\ncon salto\n\nDos\n\n\nTres'
  assert.deepEqual(splitParagraphs(text), ['Uno con salto', 'Dos', 'Tres'])
  assert.deepEqual(splitParagraphs(''), [])
  assert.deepEqual(splitParagraphs(null), [])
  assert.equal(splitParagraphs(artist.biography_es).length, 2)
})

test('isValidHttpUrl acepta http(s) y vacío, rechaza lo demás', () => {
  assert.equal(isValidHttpUrl(''), true)
  assert.equal(isValidHttpUrl('https://example.com/x'), true)
  assert.equal(isValidHttpUrl('http://example.com'), true)
  assert.equal(isValidHttpUrl('javascript:alert(1)'), false)
  assert.equal(isValidHttpUrl('example.com'), false)
})

test('isValidEmail acepta correo básico y vacío', () => {
  assert.equal(isValidEmail(''), true)
  assert.equal(isValidEmail('a@b.com'), true)
  assert.equal(isValidEmail('sin-arroba'), false)
})

test('validateArtistProfile exige nombre y valida campos opcionales', () => {
  assert.deepEqual(validateArtistProfile({ display_name: 'Josué', contact_email: 'a@b.com', website_url: '', instagram_url: null }), { ok: true, errors: {} })
  const bad = validateArtistProfile({ display_name: ' ', contact_email: 'x', website_url: 'ftp://x', instagram_url: 'no-url' })
  assert.equal(bad.ok, false)
  assert.deepEqual(Object.keys(bad.errors).sort(), ['contact_email', 'display_name', 'instagram_url', 'website_url'])
})

test('aboutMetaTitle se genera desde el perfil en ambos idiomas', () => {
  assert.equal(aboutMetaTitle(artist, 'es'), 'Josué Beltrán Uresti | Artista contemporáneo en Monterrey')
  assert.equal(aboutMetaTitle(artist, 'en'), 'Josué Beltrán Uresti | Contemporary Artist in Monterrey')
  assert.equal(aboutMetaTitle(null), '')
})

test('aboutMetaDescription usa el primer párrafo y recorta', () => {
  assert.equal(aboutMetaDescription(artist, 'es'), 'Párrafo uno.')
  const long = { ...artist, biography_es: 'x'.repeat(200) }
  assert.equal(aboutMetaDescription(long, 'es').length, 158)
})
