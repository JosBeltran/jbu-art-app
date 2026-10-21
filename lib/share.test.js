import { describe, test, expect } from 'bun:test'
import { artworkUrl, shareMessage, whatsappUrl, pinterestUrl, facebookUrl, xUrl, SHARE_CHANNELS, SITE_URL } from './share.js'

describe('artwork share urls', () => {
  test('canonical url uses www domain and sku', () => {
    expect(artworkUrl('JBU-001')).toBe(`${SITE_URL}/artwork/JBU-001`)
  })
  test('canonical url encodes special characters', () => {
    expect(artworkUrl('A B/C')).toBe(`${SITE_URL}/artwork/A%20B%2FC`)
  })
})

describe('share message', () => {
  test('includes title and Spanish byline by default', () => {
    const msg = shareMessage({ title: 'Órbita 7' })
    expect(msg).toContain('Órbita 7')
    expect(msg).toContain('Obra original de Josué Beltrán Uresti')
  })
  test('English byline when locale is en', () => {
    expect(shareMessage({ title: 'X', locale: 'en' })).toContain('Original artwork by Josué Beltrán Uresti')
  })
  test('price only appears when available and positive', () => {
    expect(shareMessage({ title: 'X', price: 15000, available: false })).not.toContain('15,000')
    expect(shareMessage({ title: 'X', price: 15000, available: true })).toContain('15,000')
    expect(shareMessage({ title: 'X', price: 0, available: true })).not.toContain('MXN')
  })
})

describe('channel urls', () => {
  const url = artworkUrl('JBU-001')
  test('whatsapp carries message and canonical url', () => {
    const w = whatsappUrl({ title: 'Órbita 7', url, price: 15000, available: true })
    expect(w.startsWith('https://wa.me/?text=')).toBe(true)
    expect(w).toContain(encodeURIComponent(url))
    expect(decodeURIComponent(w)).toContain('Órbita 7')
  })
  test('pinterest destination is the canonical page, never the raw image', () => {
    const p = pinterestUrl({ url, image: 'https://cdn.example.com/img.jpg', title: 'Órbita 7', description: 'Detalle' })
    const parsed = new URL(p)
    expect(parsed.hostname).toBe('pinterest.com')
    expect(parsed.searchParams.get('url')).toBe(url)
    expect(parsed.searchParams.get('media')).toBe('https://cdn.example.com/img.jpg')
    expect(parsed.searchParams.get('description')).toContain('Órbita 7')
  })
  test('facebook shares the canonical url', () => {
    expect(facebookUrl(url)).toBe(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`)
  })
  test('x intent carries url and title', () => {
    const x = new URL(xUrl({ url, title: 'Órbita 7' }))
    expect(x.searchParams.get('url')).toBe(url)
    expect(x.searchParams.get('text')).toBe('Órbita 7')
  })
})

describe('analytics channels', () => {
  test('channel list matches the share panel options', () => {
    expect(SHARE_CHANNELS).toEqual(['native', 'whatsapp', 'pinterest', 'facebook', 'copy_link', 'x'])
  })
})
