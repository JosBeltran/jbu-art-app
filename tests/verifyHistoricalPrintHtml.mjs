// Exercise the actual Next.js pages and cart API against mockSupabaseSocial.mjs.
import assert from 'node:assert/strict'

const site = 'http://127.0.0.1:3100'
const artworkId = 'e7ea46f2-a585-497f-a529-e6d63c661afb'
const open = 'e7ea46f2-a585-497f-a529-e6d63c661afc'
const limited = 'e7ea46f2-a585-497f-a529-e6d63c661afd'
const link = id => '/prints/ver-history-fixture?variant=' + id
async function get(path) {
  const response = await fetch(site + path)
  assert.equal(response.status, 200, path)
  return response
}

const shipping = await (await get('/api/shipping')).json()
assert.deepEqual(shipping.globalCountries, ['MX', 'CA', 'US', 'SE'])
assert.ok(shipping.defaults.open_print.length > 0)
assert.equal(shipping.policies[0].method, 'INCLUDED')
assert.equal(Object.hasOwn(shipping.policies[0], 'notes'), false)

const collection = await (await get('/prints')).text()
assert.ok(collection.includes(link(open)))
assert.ok(!collection.includes('href="' + link(limited) + '"'), 'one card per source artwork')
assert.ok(collection.includes('assets-optimized/IMG_6137.webp'))
assert.ok(collection.includes('SOLD-WITH-PRINTS'))

const detail = await (await get(link(limited))).text()
const printSection = detail.match(/<section id="prints"[^>]*>([\s\S]*?)<\/section>/)?.[1]
assert.ok(printSection?.includes('Historical A1 fixture'))
assert.ok(printSection.includes('src="/assets-optimized/IMG_6202.webp"'))
assert.ok(!detail.includes('>Agregar al carrito<'))

const { variants } = await (await get('/api/checkout/open-edition/variants?ids=' + open + ',' + limited)).json()
assert.deepEqual(variants.map(variant => [variant.artwork_id, variant.artwork.sku, variant.id, variant.resolved_print_image_url]), [
  [artworkId, 'ver-history-fixture', open, '/assets-optimized/IMG_6137.webp'],
  [artworkId, 'ver-history-fixture', limited, '/assets-optimized/IMG_6202.webp'],
])
for (const variant of variants) assert.deepEqual(variant.effective_shipping_countries, shipping.globalCountries)
console.log('Historical Open and Limited print cards, SKU deep link and cart snapshots verified')


const sold = await (await get('/artwork/SOLD-WITH-PRINTS')).text()
// The approved artwork hero keeps the sold original visible and exposes prints
// as a secondary navigation action. Print purchasing remains on /prints/:sku.
const soldHero = sold.match(/<aside\b[^>]*>([\s\S]*?)<\/aside>/)?.[1]
assert.ok(soldHero, 'sold artwork keeps its purchase information in the hero')
assert.match(soldHero, /VENDIDO|SOLD/)
assert.match(soldHero, /href="\/prints\/SOLD-WITH-PRINTS"/)
assert.match(soldHero, /Explorar Fine Art Prints|Explore Fine Art Prints/)
assert.doesNotMatch(soldHero, /Agregar al carrito|Add to cart|Comprar ahora|Buy now/)
assert.doesNotMatch(sold, /<section id="prints"/)
const soldPrints = sold.indexOf('href="/prints/SOLD-WITH-PRINTS"')
const soldSpecs = sold.search(/Ficha técnica|Technical Specifications/)
assert.ok(soldPrints > 0 && soldPrints < soldSpecs, 'prints navigation stays in the hero before visible specifications')
assert.doesNotMatch(sold, /<button[^>]*>Add print to cart/)
const promoted = await (await get('/prints/SOLD-WITH-PRINTS')).text()
assert.match(promoted, /src="\/assets-optimized\/IMG_6202.webp"/)
assert.match(promoted, /alt="(Detalle del marco|Frame detail)"/)
assert.match(promoted, /View full specifications|Ver características completas/)
assert.match(promoted, /Extended supplier specifications fixture/)
assert.doesNotMatch(promoted.split("</main>")[0], /Sold out print fixture/)
const invalid = await (await get('/prints/SOLD-WITH-PRINTS?variant=invalid')).text()
assert.match(invalid, /alt="(Detalle del marco|Frame detail)"/)

const limitedGallery = await (await get('/artwork/SOLD-WITH-PRINTS?print=e7ea46f2-a585-497f-a529-e6d63c661ad2')).text()
const limitedSection = limitedGallery.match(/<section id="prints"[^>]*>([\s\S]*?)<\/section>/)?.[1]
assert.ok(limitedSection.includes('src="/assets-optimized/IMG_6203.webp"'))
assert.ok(!limitedSection.includes('src="/assets-optimized/IMG_6202.webp"'))

for (const path of [
  '/artwork/SOLD-WITHOUT-PRINTS',
  '/artwork/SOLD-WITH-PRINTS?country=US',
  '/artwork/EXAMPLE-01',
  '/artwork/PHYSICAL-EDITION',
]) {
  const html = await (await get(path)).text()
  assert.ok(!html.includes('<section id="prints"'), path)
  const hero = html.match(/<aside\b[^>]*>([\s\S]*?)<\/aside>/)?.[1]
  assert.ok(hero, path)
  assert.doesNotMatch(hero, /Explorar Fine Art Prints|Explore Fine Art Prints/, path)
}
console.log('Sold-original secondary print navigation, country eligibility and isolated variant galleries verified')
