import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveHeroMode, selectCustomSlides, buildHeroSlides } from './heroSlides.js'

const featured = [
  { id: 'a1', sku: 'JBU-001', primary_image_url: 'https://x/1.jpg', featured: true },
  { id: 'a2', sku: 'JBU-002', primary_image_url: 'https://x/2.jpg', featured: true },
]

const customSlides = [
  { id: 's1', kind: 'IMAGE', url: 'https://x/a.jpg', position: 2, enabled: true },
  { id: 's2', kind: 'IMAGE', url: 'https://x/b.jpg', position: 1, enabled: true },
  { id: 's3', kind: 'VIDEO', url: 'https://x/v.mp4', position: 1, enabled: true },
  { id: 's4', kind: 'IMAGE', url: 'https://x/off.jpg', position: 0, enabled: false },
  { id: 's5', kind: 'IMAGE', url: '  ', position: 3, enabled: true },
]

test('modo por defecto es FEATURED sin configuración válida', () => {
  assert.equal(resolveHeroMode(null), 'FEATURED')
  assert.equal(resolveHeroMode({}), 'FEATURED')
  assert.equal(resolveHeroMode({ mode: 'OTRO' }), 'FEATURED')
  assert.equal(resolveHeroMode({ mode: 'videos' }), 'VIDEOS')
})

test('selectCustomSlides filtra por tipo, descarta desactivados y vacíos, y ordena', () => {
  const images = selectCustomSlides(customSlides, 'IMAGES')
  assert.deepEqual(images.map((s) => s.id), ['s2', 's1'])
  const videos = selectCustomSlides(customSlides, 'VIDEOS')
  assert.deepEqual(videos.map((s) => s.id), ['s3'])
})

test('FEATURED devuelve las obras destacadas con imagen', () => {
  const { mode, slides } = buildHeroSlides({ settings: { mode: 'FEATURED' }, slides: customSlides, featured })
  assert.equal(mode, 'FEATURED')
  assert.equal(slides.length, 2)
  assert.equal(slides[0].type, 'artwork')
  assert.equal(slides[0].artwork.sku, 'JBU-001')
})

test('IMAGES usa solo las imágenes personalizadas activas', () => {
  const { mode, slides } = buildHeroSlides({ settings: { mode: 'IMAGES' }, slides: customSlides, featured })
  assert.equal(mode, 'IMAGES')
  assert.equal(slides.length, 2)
  assert.equal(slides[0].type, 'custom')
  assert.equal(slides[0].kind, 'IMAGE')
  assert.equal(slides[0].url, 'https://x/b.jpg')
})

test('VIDEOS usa solo los videos personalizados activos', () => {
  const { mode, slides } = buildHeroSlides({ settings: { mode: 'VIDEOS' }, slides: customSlides, featured })
  assert.equal(mode, 'VIDEOS')
  assert.equal(slides.length, 1)
  assert.equal(slides[0].kind, 'VIDEO')
})

test('modo sin elementos válidos cae a FEATURED en vez de dejar el Hero vacío', () => {
  const { mode, slides } = buildHeroSlides({ settings: { mode: 'VIDEOS' }, slides: [customSlides[0]], featured })
  assert.equal(mode, 'FEATURED')
  assert.equal(slides.length, 2)
  assert.equal(slides[0].type, 'artwork')
})

test('sin configuración ni slides personalizados, FEATURED sigue funcionando', () => {
  const { mode, slides } = buildHeroSlides({ settings: null, slides: null, featured })
  assert.equal(mode, 'FEATURED')
  assert.equal(slides.length, 2)
})

test('obras destacadas sin imagen no entran al Hero', () => {
  const { slides } = buildHeroSlides({
    settings: null,
    slides: null,
    featured: [...featured, { id: 'a3', sku: 'JBU-003', primary_image_url: null }],
  })
  assert.equal(slides.length, 2)
})

test('las fuentes nunca se mezclan', () => {
  const { slides } = buildHeroSlides({ settings: { mode: 'IMAGES' }, slides: customSlides, featured })
  assert.ok(slides.every((s) => s.type === 'custom'))
})
