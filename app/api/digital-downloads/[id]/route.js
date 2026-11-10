import { getRequestUser } from '@/lib/offersAuth'
import { serviceClient } from '@/lib/certificates/adminAuth.server'
import { capability, uuid } from '@/lib/digitalDownloads/validation'
import { digest, guestCookie, json, newCapability } from '@/lib/digitalDownloads/commerce'

async function authorize(request, params) {
  const { id } = await params
  if (!uuid.safeParse(id).success) return null
  const db = serviceClient()
  const guest = capability.safeParse(request.cookies.get(guestCookie)?.value)
  const buyer = guest.success ? null : await getRequestUser(request, db)
  if (!guest.success && !buyer) return null
  return { db, id, guestHash: guest.success ? digest(guest.data) : null, buyerId: buyer?.id || null }
}

export async function GET(request, { params }) {
  try {
    const auth = await authorize(request, params)
    if (!auth) return json({ error: 'purchase_not_found' }, 404)
    const query = auth.db.from('digital_art_purchases')
      .select('artwork_title,size,paid_at,revoked_at,download_limit,downloads_issued').eq('id', auth.id)
    const { data, error } = await (auth.guestHash
      ? query.eq('guest_token_hash', auth.guestHash)
      : query.eq('buyer_user_id', auth.buyerId)).maybeSingle()
    if (error) throw error
    if (!data || data.revoked_at) return json({ error: 'purchase_not_found' }, 404)
    return json({
      title: data.artwork_title, size: data.size, paid: Boolean(data.paid_at),
      remaining: data.download_limit - data.downloads_issued,
    })
  } catch {
    return json({ error: 'purchase_unavailable' }, 503)
  }
}

export async function POST(request, { params }) {
  try {
    const origin = request.headers.get('origin')
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'download_unavailable' }, 403)
    const auth = await authorize(request, params)
    if (!auth) return json({ error: 'download_unavailable' }, 404)
    const ticket = newCapability()
    const { data, error } = await auth.db.rpc('issue_digital_art_ticket', {
      _purchase: auth.id, _buyer: auth.buyerId, _guest_hash: auth.guestHash, _ticket_hash: digest(ticket),
    })
    if (error) throw error
    if (data !== true) return json({ error: 'download_unavailable' }, 404)
    return json({ url: `/api/digital-downloads/file/${ticket}` }, 201)
  } catch {
    return json({ error: 'download_unavailable' }, 503)
  }
}
