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
  sku: 'EXAMPLE-01', title: 'Example', series: 'Epoxi', series_id: series.id,
  status: 'AVAILABLE', primary_image_url: null, allows_prints: false,
}
const historical = {
  ...artwork, id: 'e7ea46f2-a585-497f-a529-e6d63c661afb', sku: 'ver-history-fixture',
  title: 'Earlier version fixture', allows_prints: true, is_historical_version: true,
  availability_status: 'NOT_FOR_SALE', version_parent_id: artwork.id, version_kind: 'SNAPSHOT',
}
const openPrint = {
  id: 'e7ea46f2-a585-497f-a529-e6d63c661afc', artwork_id: historical.id,
  title: 'Historical A2 fixture', size: 'A2', edition_type: 'OPEN', finish: 'FINE_ART',
  price: 450, is_active: true, is_available: true, sort_order: 0, image_url: '/historical-a2.webp',
}
const limitedPrint = {
  ...openPrint, id: 'e7ea46f2-a585-497f-a529-e6d63c661afd', size: 'A1', edition_type: 'LIMITED',
  title: 'Historical A1 fixture', max_edition_size: 4, prints_sold: 1, sort_order: 1, image_url: '/historical-a1.webp',
}
const prints = [openPrint, limitedPrint]
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
const settings = {
  id: true, inquiry_channel: 'WHATSAPP', whatsapp_number: '',
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
  const single = String(req.headers.accept || '').includes('application/vnd.pgrst.object+json')
  let payload = []
  if (url.pathname === '/rest/v1/series') payload = [series]
  if (url.pathname === '/rest/v1/artworks_discoverable' || url.pathname === '/rest/v1/artworks') payload = [artwork]
  if (url.pathname === '/rest/v1/artworks' && url.searchParams.get('sku') === 'eq.' + historical.sku)
    payload = [{ ...historical, artwork_prints: prints }]
  if (url.pathname === '/rest/v1/artwork_images') payload = [
    { id: 'e7ea46f2-a585-497f-a529-e6d63c661ab3', image_url: '/icon.png', media_type: 'image', display_order: 0, artwork_id: historical.id },
  ]
  if (url.pathname === '/rest/v1/artwork_prints' && !url.searchParams.has('artwork_id')) {
    const ids = url.searchParams.get('id')
    payload = prints.filter(print => !ids || ids.includes(print.id))
  }
  if (url.pathname === '/rest/v1/rpc/public_print_artworks') {
    let body = ''
    for await (const chunk of req) body += chunk
    const { _ids } = JSON.parse(body)
    if (_ids.includes(historical.id)) payload = [historical]
  }
  if (url.pathname === '/rest/v1/rpc/public_artwork_versions') payload = [artwork, historical]
  if (url.pathname === '/rest/v1/print_order_preparations') payload = [preparation]
  if (url.pathname === '/rest/v1/print_asset_generations') payload = [revision]
  if (url.pathname === '/rest/v1/site_settings') payload = [settings]
  res.writeHead(200, headers)
  res.end(JSON.stringify(single ? (payload[0] || null) : payload))
}).listen(3999, '127.0.0.1', () => console.log('Mock Supabase listening on 3999'))
