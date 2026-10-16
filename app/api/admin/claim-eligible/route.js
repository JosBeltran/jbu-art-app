import { createClient } from '@supabase/supabase-js'
import { isArtworkClaimEligible, needsStatusReview } from '@/lib/artworkStatus'

// Obras vendidas listas para generar reclamación (READY FOR CLAIM)
// y filas contradictorias que requieren revisión manual (NEEDS REVIEW).
// Nunca exige cambiar ownership_status a AVAILABLE.
export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { data: artworks, error } = await supabase
      .from('artworks')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    // Lotes de reclamación activos: order_items vinculados a un claim_group
    // aún no reclamados. Una obra con lote activo no puede recibir otro.
    const { data: activeItems } = await supabase
      .from('order_items')
      .select('artwork_id')
      .not('claim_group_id', 'is', null)
      .eq('is_claimed', false)

    const activeBatchIds = new Set((activeItems || []).map((i) => i.artwork_id))

    const ready = []
    const needsReview = []
    for (const art of artworks || []) {
      if (needsStatusReview(art)) {
        needsReview.push(art)
        continue
      }
      const hasActiveClaim =
        Boolean(art.pending_owner_id) ||
        ['CLAIM_PENDING', 'CLAIMED', 'VERIFIED'].includes(String(art.ownership_status || '').toUpperCase())
      if (isArtworkClaimEligible(art, { hasActiveClaim, hasActiveBatch: activeBatchIds.has(art.id) })) {
        ready.push({ ...art, price: art.base_price_mxn || art.calculated_price_mxn || 0 })
      }
    }

    return Response.json({ ready, needsReview })
  } catch (err) {
    console.error('Error en /api/admin/claim-eligible:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
