import { NextResponse } from 'next/server'
import { serviceClient, getRequestUser } from '@/lib/offersAuth'
import { issuePhysicalEditionCertificate } from '@/lib/certificates/physicalEdition.server'
import { HttpError } from '@/lib/certificates/adminAuth.server'

export const dynamic = 'force-dynamic'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const headers = { 'Cache-Control': 'no-store' }

export async function POST(request) {
  try {
    const db = serviceClient()
    const user = await getRequestUser(request, db)
    if (!user?.id) return NextResponse.json({ error: 'auth_required' }, { status: 401, headers })
    const body = await request.json()
    if (!uuid.test(String(body?.orderItemId || ''))) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400, headers })
    }
    const result = await issuePhysicalEditionCertificate({
      db, orderItemId: body.orderItemId, buyerId: user.id,
    })
    return NextResponse.json({
      created: result.created,
      sku: result.certificate.sku,
      certificateNumber: result.certificate.certificate_number,
      pdfReady: result.pdfReady,
    }, { headers })
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500
    console.error('[physical-edition] claim failed', { code: err?.code || err?.message })
    return NextResponse.json({ error: err instanceof HttpError ? err.code : 'edition_certificate_unavailable' }, { status, headers })
  }
}
