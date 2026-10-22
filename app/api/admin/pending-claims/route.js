// app/api/admin/pending-claims/route.js
import { requireCertificateAdmin, serviceClient, errorResponse } from '@/lib/certificates/adminAuth.server'

export async function GET(request) {
  try {
    // Solo Admin verificado en servidor; después, cliente de servicio.
    await requireCertificateAdmin(request)
    const supabase = serviceClient()

    // 1. Consultar ÚNICAMENTE obras que tienen un dueño/solicitante asignado
    //    y que están en proceso de reclamo o vendidas sin certificado emitido.
    const { data: artworks, error: artworksError } = await supabase
      .from('artworks')
      .select(`
        id,
        sku,
        title,
        ownership_status,
        current_owner_id,
        pending_owner_id,
        claim_notes,
        primary_image_url,
        certificate_hash,
        certificate_issued_at,
        created_at
      `)
      .in('ownership_status', ['CLAIM_PENDING', 'SOLD', 'CLAIMED', 'VERIFIED'])
      .is('certificate_hash', null) // Solo las que FALTA emitir certificado
      .order('created_at', { ascending: false })

    if (artworksError) throw artworksError

    // 2. Extraer IDs de usuarios
    const userIds = [
      ...(artworks || []).map(a => a.current_owner_id),
      ...(artworks || []).map(a => a.pending_owner_id)
    ].filter(Boolean)

    // 3. Consultar perfiles
    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)

      if (!profilesError && profiles) {
        const profileMap = new Map(profiles.map(p => [p.id, p]))

        artworks.forEach(art => {
          art.owner_profile = profileMap.get(art.current_owner_id) || null
          art.pending_profile = profileMap.get(art.pending_owner_id) || null
          art.profiles = art.pending_profile || art.owner_profile
        })
      }
    }

    return Response.json({ artworks: artworks || [] })
  } catch (err) {
    return errorResponse(err, 'pending-claims')
  }
}