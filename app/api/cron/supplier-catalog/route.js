import { timingSafeEqual } from 'node:crypto'
import { serviceClient } from '@/lib/certificates/adminAuth.server'
import { scheduledSupplierSync } from '@/lib/productCatalog/supplierSync.server'

export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=60
export async function POST(request) {
  const expected=process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : ''
  const supplied=request.headers.get('authorization') || ''
  if(!expected || Buffer.byteLength(expected)!==Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(expected),Buffer.from(supplied)))
    return Response.json({error:'unauthorized'},{status:401})
  try {
    const results=await scheduledSupplierSync(serviceClient())
    console.info('[supplier-catalog-worker]',JSON.stringify(results))
    return Response.json(results,{status:results.some(result=>result.error) ? 503 : 200,headers:{'Cache-Control':'no-store'}})
  } catch {
    return Response.json({error:'supplier_sync_unavailable'},{status:503})
  }
}
export const GET=POST
