import { serviceClient } from '@/lib/certificates/adminAuth.server'
import { bucket, capability } from '@/lib/digitalDownloads/validation'
import { digest, json, noStore } from '@/lib/digitalDownloads/commerce'

export async function HEAD() {
  // A link scanner or preflight must not consume a one-time ticket.
  return new Response(null, { status: 405, headers: { ...noStore, Allow: 'GET' } })
}

export async function GET(request, { params }) {
  try {
    const { ticket } = await params
    if (!capability.safeParse(ticket).success) return json({ error: 'download_unavailable' }, 404)
    const db = serviceClient()
    const { data, error } = await db.rpc('redeem_digital_art_ticket', { _ticket_hash: digest(ticket) }).maybeSingle()
    if (error) throw error
    if (!data) return json({ error: 'download_unavailable' }, 404)

    const master = await db.storage.from(bucket).download(data.master_path, {}, {
      cache: 'no-store', signal: request.signal,
    }).asStream()
    if (master.error || !master.data) throw new Error('master_unavailable')
    const filename = data.master_name.replace(/[^a-zA-Z0-9._-]/g, '-')
    return new Response(master.data, {
      headers: {
        ...noStore,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return json({ error: 'download_unavailable' }, 503)
  }
}
