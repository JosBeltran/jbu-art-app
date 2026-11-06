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
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:3999')
  if (url.pathname.startsWith('/auth/')) {
    res.writeHead(401, headers)
    res.end(JSON.stringify({ message: 'No session' }))
    return
  }
  const single = String(req.headers.accept || '').includes('application/vnd.pgrst.object+json')
  let payload = []
  if (url.pathname === '/rest/v1/series') payload = [series]
  if (url.pathname === '/rest/v1/artworks_discoverable' || url.pathname === '/rest/v1/artworks') payload = [artwork]
  if (url.pathname === '/rest/v1/artwork_prints') payload = []
  if (url.pathname === '/rest/v1/site_settings') payload = [settings]
  res.writeHead(200, headers)
  res.end(JSON.stringify(single ? (payload[0] || null) : payload))
}).listen(3999, '127.0.0.1', () => console.log('Mock Supabase listening on 3999'))
