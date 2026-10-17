import { createClient } from '@supabase/supabase-js'
import { needsStatusReview } from '@/lib/artworkStatus'
import { isAdminReadyForClaim, readyForClaimQuery } from '@/lib/adminReadyForClaim'

// Obras vendidas listas para generar reclamación (READY FOR CLAIM)
// y filas contradictorias que requieren revisión manual (NEEDS REVIEW).
// Nunca exige cambiar ownership_status a AVAILABLE.
export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const [readyResult, reviewResult] = await Promise.all([
      readyForClaimQuery(supabase),
      // Preserve the existing NEEDS REVIEW population independently of READY.
      supabase.from('artworks').select('*').order('created_at', { ascending: false }),
    ])
    if (readyResult.error) throw readyResult.error
    if (reviewResult.error) throw reviewResult.error

    // Lotes de reclamación activos: order_items vinculados a un claim_group
    // aún no reclamados. Una obra con lote activo no puede recibir otro.
    const { data: activeItems, error: activeItemsError } = await supabase
      .from('order_items')
      .select('artwork_id')
      .not('claim_group_id', 'is', null)
      .eq('is_claimed', false)

    // Fail closed rather than listing duplicate candidates when the lookup fails.
    if (activeItemsError) throw activeItemsError

    const activeBatchIds = new Set((activeItems || []).map((i) => i.artwork_id))

    const ready = []
    const needsReview = (reviewResult.data || []).filter(needsStatusReview)
    for (const art of readyResult.data || []) {
      if (isAdminReadyForClaim(art, { hasActiveBatch: activeBatchIds.has(art.id) })) {
        ready.push({ ...art, price: art.base_price_mxn || art.calculated_price_mxn || 0 })
      }
    }

    return Response.json({ ready, needsReview })
  } catch (err) {
    console.error('Error en /api/admin/claim-eligible:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
