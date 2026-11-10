import assert from 'node:assert/strict'
import sharp from 'sharp'

const site = 'http://127.0.0.1:3100'
const id = suffix => 'e7ea46f2-a585-497f-a529-e6d63c661a' + suffix
const open = id('fc')
const limited = id('fd')
const missing = id('b4')
const soldOut = id('b5')

async function request(path, bot = 'facebookexternalhit/1.1') {
  return fetch(site + path, { headers: { 'user-agent': bot } })
}

for (const crawler of ['facebookexternalhit/1.1', 'WhatsApp/2.24', 'LinkedInBot/1.0']) {
  const response = await request('/prints/' + open + '?lang=en', crawler)
  assert.equal(response.status, 200, crawler)
  const html = await response.text()
  const head = html.split('</head>')[0]
  assert.match(head, /property="og:title" content="Earlier version fixture \| A2 Fine Art Print"/)
  assert.match(head, /property="og:type" content="website"/)
  assert.match(head, /property="og:description" content="42 × 59.4 cm .*Cotton Rag 310 gsm/)
  assert.ok(head.includes('property="og:url" content="https://www.josuebeltranuresti.com/prints/' + open + '?lang=en"'))
  assert.ok(head.includes('property="og:image" content="https://www.josuebeltranuresti.com/social/print/' + open))
  assert.match(head, /property="og:image:width" content="1200"/)
  assert.match(head, /property="og:image:height" content="630"/)
  assert.match(head, /name="twitter:card" content="summary_large_image"/)
  assert.match(head, /name="twitter:description"/)
  assert.match(head, /name="twitter:image"/)
  assert.match(head, /name="twitter:title"/)
  const section = html.match(/<section id="prints"[^>]*>([\s\S]*?)<\/section>/)?.[1] || ''
  assert.ok(section.includes('Historical A2 fixture'))
  assert.ok(section.includes('src="/assets-optimized/IMG_6137.webp"'))
  assert.match(section, />Compartir<|>Share</)
  assert.match(section, /Agregar print|Add print/)
}

const limitedPage = await (await request('/prints/' + limited)).text()
assert.match(limitedPage.split('</head>')[0], /Versión anterior de prueba \| Impresión Fine Art A1/)
assert.match(limitedPage, /Historical A1 fixture/)
assert.match(limitedPage, /src="\/assets-optimized\/IMG_6202.webp"/)
const soldOutPage = await (await request('/prints/' + soldOut)).text()
assert.match(soldOutPage, /Sold out print fixture/)
assert.match(soldOutPage, /Edición agotada|Sold out edition/)
for (const unavailable of [id('b6'), id('b7'), 'not-a-uuid']) {
  assert.equal((await request('/prints/' + unavailable)).status, 404)
  assert.equal((await request('/social/print/' + unavailable)).status, 404)
}

async function socialImage(id) {
  const response = await request('/social/print/' + id + '?lang=en')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/jpeg')
  const bytes = Buffer.from(await response.arrayBuffer())
  const metadata = await sharp(bytes).metadata()
  assert.deepEqual([metadata.width, metadata.height], [1200, 630])
  return bytes
}
const first = await socialImage(open)
const second = await socialImage(limited)
const placeholder = await socialImage(missing)
assert.notDeepEqual(first, second)
assert.notDeepEqual(first, placeholder)
async function sample(image, left, top, width = 15, height = 15) {
  return [...await sharp(image).extract({ left, top, width, height }).resize(1, 1).removeAlpha().raw().toBuffer()]
}
for (const [bytes, asset] of [[first, 'IMG_6137'], [second, 'IMG_6202'], [placeholder, null]]) {
  const source = asset ? 'public/assets-optimized/' + asset + '.webp' : 'public/images/artwork-placeholder.jpg'
  const fitted = await sharp(source).rotate().resize({ width: 716, height: 570, fit: 'inside', withoutEnlargement: true }).png().toBuffer()
  const { width, height } = await sharp(fitted).metadata()
  const shown = await sample(bytes, 395, 315)
  const expected = await sample(fitted, Math.floor(width / 2), Math.floor(height / 2))
  assert.ok(shown.every((channel, i) => Math.abs(channel - expected[i]) < 14), JSON.stringify({ asset, shown, expected }))
}
const reference = await sharp('public/assets-optimized/IMG_6137.webp').rotate()
  .resize({ width: 716, height: 570, fit: 'inside', withoutEnlargement: true }).png().toBuffer()
const { width: artWidth, height: artHeight } = await sharp(reference).metadata()
const logoLeft = Math.min(706, Math.round((790 + artWidth) / 2) - 18) + 8
const logoTop = Math.max(14, Math.round((630 - artHeight) / 2) - 12) + 8
const logoBytes = await sharp(first).extract({ left: logoLeft, top: logoTop, width: 54, height: 54 }).toBuffer()
const logo = await sharp(logoBytes).stats()
assert.ok(logo.channels[0].stdev > 10, 'the preview corner includes the brand mark')
console.log('Print-specific HTML, crawler tags, both editions, unavailable states and branded JPEGs verified')
