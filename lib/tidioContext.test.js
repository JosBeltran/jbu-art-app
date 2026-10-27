import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTidioContext, canLoadTidio } from './tidioContext.js'
import { whenTidioReady } from '../components/chat/tidio.js'

const artwork = { id: 'art-1', sku: 'JBU-030', title: 'Urban Geology I', dimensions: '85 × 55 cm', availability_status: 'AVAILABLE', base_price_mxn: 5000, price_display_mode: 'SHOW_PRICE' }
test('Tidio requires optional marketing/chat consent', () => {
  assert.equal(canLoadTidio('/catalog'), false)
  assert.equal(canLoadTidio('/catalog', { marketing: false }), false)
  assert.equal(canLoadTidio('/catalog', { marketing: true }), true)
})
test('Admin never loads Tidio, all requested public routes can load it', () => {
  const consent = { marketing: true }
  assert.equal(canLoadTidio('/admin', consent), false)
  assert.equal(canLoadTidio('/admin/artworks', consent), false)
  for (const path of ['/', '/catalog', '/artwork/JBU-030', '/series', '/about', '/como-funciona', '/offers']) assert.equal(canLoadTidio(path, consent), true)
})
test('Artwork context preserves dimensions and language with safe campaign attribution', () => {
  const context = buildTidioContext({ artwork, language: 'en', url: 'https://www.josuebeltranuresti.com/artwork/JBU-030?utm_source=Pinterest&utm_campaign=Autumn&token=SECRET#auth', referrer: 'https://pinterest.com/pin/private?email=private@example.com' })
  assert.equal(context.artwork_title, 'Urban Geology I')
  assert.equal(context.artwork_dimensions, '85 × 55 cm')
  assert.equal(context.current_language, 'en')
  assert.equal(context.utm_source, 'Pinterest')
  assert.equal(context.artwork_url, 'https://www.josuebeltranuresti.com/artwork/JBU-030')
  assert.equal(context.referrer, 'https://pinterest.com')
  assert.equal(JSON.stringify(context).includes('SECRET'), false)
  assert.equal(JSON.stringify(context).includes('private@example.com'), false)
})
test('CONTACT_FOR_PRICE never sends price or currency to Tidio', () => {
  const context = buildTidioContext({ artwork: { ...artwork, price_display_mode: 'CONTACT_FOR_PRICE' } })
  assert.equal(context.artwork_price, '')
  assert.equal(context.artwork_currency, '')
})
test('SOLD never sends price to Tidio', () => {
  assert.equal(buildTidioContext({ artwork: { ...artwork, availability_status: 'SOLD' } }).artwork_price, '')
})
test('Public SHOW_PRICE uses shared MXN price rule', () => {
  const context = buildTidioContext({ artwork })
  assert.equal(context.artwork_price, '5000')
  assert.equal(context.artwork_currency, 'MXN')
})
test('Context does not infer artist from owner or send identity', () => {
  const context = buildTidioContext({ artwork: { ...artwork, owner_name: 'Private Owner', email: 'private@example.com', owner_id: 'private-id' }, url: 'https://example.com?utm_campaign=private@example.com' })
  assert.equal(context.artwork_artist, '')
  assert.equal(context.utm_campaign, '')
  assert.equal(JSON.stringify(context).includes('Private Owner'), false)
})
test('Leaving artwork page clears all artwork fields', () => {
  const context = buildTidioContext({ url: 'https://example.com/catalog' })
  for (const [key, value] of Object.entries(context)) if (key.startsWith('artwork_')) assert.equal(value, '')
})
test('Ready subscriptions wait for readiness, run once and respect cancellation', () => {
  const savedWindow = globalThis.window, savedDocument = globalThis.document
  const events = new EventTarget(), handlers = []
  const api = { on: (_event, cb) => handlers.push(cb) }
  globalThis.window = { tidioChatApi: api }
  globalThis.document = events
  try {
    let calls = 0
    const cancel = whenTidioReady(() => { calls += 1 })
    assert.equal(calls, 0)
    handlers[0]()
    events.dispatchEvent(new Event('tidioChat-ready'))
    assert.equal(calls, 1)
    cancel()
    whenTidioReady(() => { calls += 1 })()
    assert.equal(calls, 2)
    globalThis.window = {}
    const cancelled = whenTidioReady(() => { calls += 1 })
    cancelled()
    globalThis.window.tidioChatApi = {}
    events.dispatchEvent(new Event('tidioChat-ready'))
    assert.equal(calls, 2)
  } finally {
    globalThis.window = savedWindow
    globalThis.document = savedDocument
  }
})