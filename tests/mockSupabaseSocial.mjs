// Local ephemeral Supabase REST stub for checking actual server-rendered crawler HTML.
// Used only by the PR CI; no production routes or Supabase data are modified.
import http from 'node:http'

const series = {
  id: '46ea46f2-a585-497f-a529-e6d63c661afa',
  title: 'Epoxi', name_es: 'Epoxi', name_en: 'Epoxy',
  short_description_es: 'Obras de resina',
  short_description_en: 'Resin artworks',
  editorial_status: 'active', auto_launch: false, main_artwork_id: null,
}
const artwork = {
  id: 'e7ea46f2-a585-497f-a529-e6d63c661afa',
  sku: 'EXAMPLE-01', title: 'Example', title_en: 'Example', series: 'Epoxi', series_id: series.id,
  status: 'AVAILABLE', availability_status:'AVAILABLE', ownership_status:'AVAILABLE',
  primary_image_url: '/assets-optimized/IMG_6137.webp', allows_prints: false,
  base_price_mxn:125000, price_display_mode:'SHOW_PRICE', delivery_category:'standard', dimensions:'60 x 80 cm', medium:'Acrílico sobre madera', year:2026,
}
const historical = {
  ...artwork, id: 'e7ea46f2-a585-497f-a529-e6d63c661afb', sku: 'ver-history-fixture',
  primary_image_url: null,
  title: 'Versión anterior de prueba', title_en: 'Earlier version fixture', allows_prints: true, is_historical_version: true,
  availability_status: 'NOT_FOR_SALE', version_parent_id: artwork.id, version_kind: 'SNAPSHOT',
}
const openPrint = {
  id: 'e7ea46f2-a585-497f-a529-e6d63c661afc', artwork_id: historical.id,
  title: 'Historical A2 fixture', size: 'A2', edition_type: 'OPEN', finish: 'FINE_ART',
  price: 450, is_active: true, is_available: true, sort_order: 0, image_url: '/assets-optimized/IMG_6137.webp',
  paper_type: 'Cotton Rag 310 gsm',
}
const limitedPrint = {
  ...openPrint, id: 'e7ea46f2-a585-497f-a529-e6d63c661afd', size: 'A1', edition_type: 'LIMITED',
  title: 'Historical A1 fixture', max_edition_size: 4, prints_sold: 1, sort_order: 1, image_url: '/assets-optimized/IMG_6202.webp',
  paper_type: 'Papel Fine Art', framing: 'Marco negro',
}
const missingImage = {
  ...openPrint, id: 'e7ea46f2-a585-497f-a529-e6d63c661ab4', size: 'A3', title: 'Missing image fixture', sort_order: 20,
  image_url: '/assets-optimized/does-not-exist.webp',
}
const soldOutPrint = {
  ...limitedPrint, id: 'e7ea46f2-a585-497f-a529-e6d63c661ab5', title: 'Sold out print fixture', prints_sold: 4,
}
const inactivePrint = { ...openPrint, id: 'e7ea46f2-a585-497f-a529-e6d63c661ab6', is_active: false }
const hiddenPrint = { ...openPrint, id: 'e7ea46f2-a585-497f-a529-e6d63c661ab7', artwork_id: artwork.id }
const prints = [openPrint, limitedPrint, missingImage, soldOutPrint, inactivePrint]
const soldWithPrints = {
  ...artwork, id: 'e7ea46f2-a585-497f-a529-e6d63c661ac1', sku: 'SOLD-WITH-PRINTS',
  title: 'Corriente inicial', title_en: 'First Current', allows_prints: true, availability_status: 'SOLD', ownership_status: 'SOLD',
}
const soldWithoutPrints = {
  ...soldWithPrints, id: 'e7ea46f2-a585-497f-a529-e6d63c661ac2', sku: 'SOLD-WITHOUT-PRINTS', title: 'Intervalo quieto', title_en: 'Quiet Interval', primary_image_url: '/assets-optimized/IMG_6203.webp',
}
const physicalEdition = {
  ...artwork, id: 'e7ea46f2-a585-497f-a529-e6d63c661ac3', sku: 'PHYSICAL-EDITION',
  title: 'Acción material', title_en: 'Material Study', primary_image_url: '/assets-optimized/artwork-monumental-1.webp', physical_edition_type: 'LIMITED_EDITION', physical_edition_size: 5,
}
const soldVariants = [
  {
    ...openPrint, id: 'e7ea46f2-a585-497f-a529-e6d63c661ad1', artwork_id: soldWithPrints.id,
    title: 'Frame detail fixture', description: 'Extended supplier specifications fixture.',
    allowed_shipping_countries: ['MX'],
    gallery_images: [
      { url: '/assets-optimized/IMG_6202.webp', alt_es: 'Detalle del marco', alt_en: 'Frame detail' },
      { url: null, alt_es: 'Vista frontal', alt_en: 'Front view' },
    ],
  },
  { ...limitedPrint, id: 'e7ea46f2-a585-497f-a529-e6d63c661ad2', artwork_id: soldWithPrints.id,
    image_url: '/assets-optimized/IMG_6203.webp', price: 780, allowed_shipping_countries: ['MX', 'CA'] },
  { ...soldOutPrint, id: 'e7ea46f2-a585-497f-a529-e6d63c661ad3', artwork_id: soldWithPrints.id },
]
const revision = {
  revision_id: 'e7ea46f2-a585-497f-a529-e6d63c661afe', artwork_id: historical.id,
  print_id: openPrint.id, production_status: 'MASTER_READY', size: 'A2',
  production_file_path: 'private/master.jpg', preview_image_url: openPrint.image_url,
  layout: { algorithmVersion: 1, size: 'A2', paperWidthMm: 420, paperHeightMm: 594, outputDpi: 300 },
}
const preparation = {
  item_id: 'e7ea46f2-a585-497f-a529-e6d63c661aff', order_id: 'e7ea46f2-a585-497f-a529-e6d63c661af0',
  revision_id: revision.revision_id, state: 'AWAITING_APPROVAL',
  snapshot: { title: openPrint.title, preview: openPrint.image_url, layout: revision.layout },
  orders: { payment_status: 'PAID', status: 'PAYMENT_RECEIVED' },
}
// Mirror the centralized shipping migration so storefront integration checks
// exercise configured destinations rather than an absent settings schema.
const shippingPolicy = {
  id: '00000000-0000-4000-8000-000000000001', name: 'Fixture included shipping',
  name_en: 'Shipping included', name_es: 'Envío incluido', method: 'INCLUDED',
  countries: [], amount_minor: 0, currency: 'MXN', strategy: 'PER_ITEM',
  minimum_days: null, maximum_days: null, delivery_unit: 'business_day',
  fulfillment_provider: 'ARTIST', insurance_required: false, active: true,
  postal_codes: [], instructions_en: '', instructions_es: '', notes: 'Private shipping fixture notes',
}
const settings = {
  id: true, inquiry_channel: 'WHATSAPP', whatsapp_number: '',
  global_shipping_countries: ['MX', 'CA', 'US', 'SE'], shipping_revision: 1,
  default_shipping_policies: { original: [shippingPolicy.id], open_print: [shippingPolicy.id], limited_print: [shippingPolicy.id], physical: [shippingPolicy.id], supplier: [] },
  local_delivery:{enabled:true,paymentOnDeliveryEnabled:true},
  updated_at: '2026-11-06T14:00:00Z',
  social_sharing: {
    promotionalPages: {
      prints: {
        title_en: 'Preview-only Test Prints', description_en: 'Server rendered preview',
        default_language: 'en',
      },
    },
    promotionalSeries: {
      [series.id]: { title_en: 'Preview-only Test Epoxy', default_language: 'en' },
    },
  },
}
const visitor = { id: 'e7ea46f2-a585-497f-a529-e6d63c661ab0', email: 'private@example.test', email_confirmed_at: '2026-01-01T00:00:00Z',
  aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'google', providers: ['google'] },
  user_metadata: { full_name: 'New Google participant' }, identities: [{ provider: 'google',
    identity_data: { full_name: 'New Google participant', picture: 'https://lh3.googleusercontent.com/avatar' } }] }
const token = [Buffer.from('{"alg":"HS256"}').toString('base64url'),
  Buffer.from(JSON.stringify({ sub: visitor.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
  'fixture'].join('.')
const publicComment = { id: 'e7ea46f2-a585-497f-a529-e6d63c661ab1', body: 'Public fixture question',
  author_display_name: 'Public visitor', moderation_status: 'APPROVED', created_at: '2026-01-01T00:00:00Z' }
const privateComment = { ...publicComment, id: 'e7ea46f2-a585-497f-a529-e6d63c661ab2', body: 'Private pending fixture',
  moderation_status: 'PENDING', author_display_name: 'New Google participant', mine: true }
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,HEAD,OPTIONS' }
const readBody = async request => {
  let body = ''
  for await (const chunk of request) body += chunk
  return JSON.parse(body)
}
const galleryStorage = new Set()
const galleryRevisions = new Map()
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:3999')
  const auth = req.headers.authorization
  const send = (status, body) => { res.writeHead(status, headers); res.end(JSON.stringify(body)) }
  if (req.method === 'OPTIONS') return send(200, null)
  if (url.pathname === '/auth/v1/authorize') {
    const callback = new URL(url.searchParams.get('redirect_to'))
    callback.searchParams.set('code', 'fixture-pkce')
    res.writeHead(302, { Location: callback.href })
    return res.end()
  }
  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'pkce')
    return send(200, { access_token: token, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user: visitor })
  if (url.pathname === '/auth/v1/user' && [`Bearer ${token}`, 'Bearer fixture-commenter'].includes(auth))
    return send(200, visitor)
  if (url.pathname === '/rest/v1/rpc/comment_context_public') {
    const context = await readBody(req)
    return send(200, [artwork.id, historical.id].includes(context._art))
  }
  if (url.pathname === '/rest/v1/rpc/read_artwork_discussion') {
    const input = await readBody(req)
    return send(200, { enabled: true, maxLength: 1200, allowReplies: true, allowDisplayName: true,
      comments: input._viewer === visitor.id ? [publicComment, privateComment] : [publicComment] })
  }
  if (url.pathname === '/rest/v1/rpc/submit_artwork_comment') {
    const input = await readBody(req)
    if (input._user !== visitor.id || input._studio || input._name !== 'New Google participant') return send(400, { message: 'invalid_action' })
    return send(200, { id: privateComment.id, status: 'PENDING' })
  }
  if (url.pathname === '/rest/v1/rpc/list_admin_artwork_comments')
    return send(200, { comments: [{ ...privateComment, context_kind: 'artwork', context_ref: '', artwork_id: historical.id,
      artwork_title: historical.title, sku: historical.sku, reports: [] }] })
  if (url.pathname === '/auth/v1/user' && ['Bearer fixture-admin', 'Bearer fixture-collector'].includes(auth)) {
    res.writeHead(200, headers)
    res.end(JSON.stringify({ id: artwork.id }))
    return
  }
  if (url.pathname === '/rest/v1/rpc/is_jbu_admin') {
    res.writeHead(200, headers)
    res.end(JSON.stringify(auth === 'Bearer fixture-admin'))
    return
  }
  if (url.pathname.startsWith('/auth/')) {
    res.writeHead(401, headers)
    res.end(JSON.stringify({ message: 'No session' }))
    return
  }
  const uploadPrefix = '/storage/v1/object/artworks/'
  const infoPrefix = '/storage/v1/object/info/artworks/'
  if (req.method === 'POST' && url.pathname.startsWith(uploadPrefix) && url.pathname.includes('artwork-images/print-galleries/')) {
    await new Promise(resolve => req.on("end", resolve).resume())
    const path = url.pathname.slice(uploadPrefix.length)
    galleryStorage.add(path)
    return send(200, { Key: 'artworks/' + path })
  }
  if (url.pathname.startsWith(infoPrefix)) {
    const path = url.pathname.slice(infoPrefix.length)
    return galleryStorage.has(path) ? send(200, { name: path }) : send(404, { code: 'NoSuchKey' })
  }
  if (req.method === 'PATCH' && url.pathname === '/rest/v1/artwork_prints' && url.searchParams.has('gallery_revision')) {
    const id = url.searchParams.get('id').slice(3)
    const revision = galleryRevisions.get(id) ?? 0
    if (url.searchParams.get('gallery_revision') !== 'eq.' + revision) return send(200, [])
    const updated = await readBody(req)
    galleryRevisions.set(id, updated.gallery_revision)
    return send(200, [updated])
  }
  const single = String(req.headers.accept || '').includes('application/vnd.pgrst.object+json')
  let payload = []
  if (url.pathname === '/rest/v1/series') payload = [series]
  if (url.pathname === '/rest/v1/artworks_discoverable' || url.pathname === '/rest/v1/artworks') payload = [artwork]
  if (url.pathname === '/rest/v1/artworks' && url.searchParams.has('id')) {
    const ids = url.searchParams.get('id')
    payload = [artwork, historical, soldWithPrints, soldWithoutPrints, physicalEdition].filter(row => ids.includes(row.id))
  }
  if (url.pathname === '/rest/v1/artworks' && url.searchParams.get('sku') === 'eq.' + historical.sku)
    payload = [{ ...historical, artwork_prints: prints }]
  if (url.pathname === '/rest/v1/artworks') {
    const fixture = [soldWithPrints, soldWithoutPrints, physicalEdition].find(row => url.searchParams.get('sku') === 'eq.' + row.sku)
    if (fixture) payload = [{ ...fixture, artwork_prints: fixture === soldWithPrints ? soldVariants : [] }]
  }
  if (url.pathname === '/rest/v1/artwork_images') payload = [
    { id: 'e7ea46f2-a585-497f-a529-e6d63c661ab3', image_url: '/icon.png', media_type: 'image', display_order: 0, artwork_id: historical.id },
    { id: 'e7ea46f2-a585-497f-a529-e6d63c661ac4', image_url: '/assets-optimized/IMG_6202.webp',
      media_type: 'image', is_print_image: true, display_order: 0, artwork_id: soldWithPrints.id },
  ].filter(row => !url.searchParams.has('artwork_id') || url.searchParams.get('artwork_id').includes(row.artwork_id))
  if (url.pathname === '/rest/v1/artworks_discoverable' ||
      (url.pathname === '/rest/v1/artworks' && url.searchParams.has('status') && !url.searchParams.has('sku'))) payload = [artwork, soldWithPrints, soldWithoutPrints, physicalEdition]
  if (url.pathname === '/rest/v1/artwork_prints') {
    const ids = url.searchParams.get('id')
    const parents = url.searchParams.get('artwork_id')
    payload = [...prints, hiddenPrint, ...soldVariants].filter(print =>
      (!parents || parents.includes(print.artwork_id)) &&
      (!ids || ids.includes(print.id)) &&
      (url.searchParams.get('is_active') !== 'eq.true' || print.is_active))
  }
  if (url.pathname === '/rest/v1/rpc/public_print_artworks') {
    let body = ''
    for await (const chunk of req) body += chunk
    const { _ids } = JSON.parse(body)
    payload = [historical, soldWithPrints].filter(row => _ids.includes(row.id))
  }
  if (url.pathname === '/rest/v1/rpc/public_artwork_versions') payload = [artwork, historical]
  if (url.pathname === '/rest/v1/print_order_preparations') payload = [preparation]
  if (url.pathname === '/rest/v1/print_asset_generations') payload = [revision]
  if (url.pathname === '/rest/v1/rpc/physical_edition_counts') return send(200, {
    edition_size: 5, available: 3, reserved: 1, sold: 1, sales_enabled: true,
  })
  if (url.pathname === '/rest/v1/rpc/physical_edition_counts_batch') payload = [{
    artwork_id: physicalEdition.id, edition_size: 5, available: 3, reserved: 1, sold: 1, sales_enabled: true,
  }]
  if (url.pathname === '/rest/v1/site_settings') payload = [settings]
  if (url.pathname === '/rest/v1/shipping_policies') payload = [shippingPolicy]
  res.writeHead(200, headers)
  res.end(JSON.stringify(single ? (payload[0] || null) : payload))
}).listen(Number(process.env.PORT||3999), '127.0.0.1', () => console.log('Mock Supabase listening'))
