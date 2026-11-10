// Exercise the actual Next.js pages and cart API against mockSupabaseSocial.mjs.
import assert from 'node:assert/strict'

const site = 'http://127.0.0.1:3100'
const artworkId = 'e7ea46f2-a585-497f-a529-e6d63c661afb'
const open = 'e7ea46f2-a585-497f-a529-e6d63c661afc'
const limited = 'e7ea46f2-a585-497f-a529-e6d63c661afd'
const link = id => '/artwork/ver-history-fixture?print=' + id + '#prints'
async function get(path) {
  const response = await fetch(site + path)
  assert.equal(response.status, 200, path)
  return response
}

const collection = await (await get('/prints')).text()
assert.ok(collection.includes(link(open)))
assert.ok(collection.includes(link(limited)))
assert.ok(collection.includes('historical-a2.webp'))
assert.ok(collection.includes('historical-a1.webp'))

const detail = await (await get(link(limited))).text()
const printSection = detail.match(/<section id="prints"[^>]*>([\s\S]*?)<\/section>/)?.[1]
assert.ok(printSection?.includes('Historical A1 fixture'))
assert.ok(printSection.includes('src="/historical-a1.webp"'))
assert.ok(!detail.includes('>Agregar al carrito<'))

const { variants } = await (await get('/api/checkout/open-edition/variants?ids=' + open + ',' + limited)).json()
assert.deepEqual(variants.map(variant => [variant.artwork_id, variant.artwork.sku, variant.id, variant.resolved_print_image_url]), [
  [artworkId, 'ver-history-fixture', open, '/historical-a2.webp'],
  [artworkId, 'ver-history-fixture', limited, '/historical-a1.webp'],
])
console.log('Historical Open and Limited print cards, SKU deep link and cart snapshots verified')
