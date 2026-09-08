import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    // 1. Consultar obras con solicitudes pendientes o reclamos finalizados
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
        certificate_hash,
        certificate_issued_at,
        created_at
      `)
      .in('ownership_status', ['CLAIM_PENDING', 'CLAIMED', 'VERIFIED'])
      .order('created_at', { ascending: false })

    if (artworksError) throw artworksError

    // 2. Extraer todos los IDs de usuarios (tanto dueños actuales como solicitantes pendientes)
    const userIds = [
      ...(artworks || []).map(a => a.current_owner_id),
      ...(artworks || []).map(a => a.pending_owner_id)
    ].filter(Boolean)

    // 3. Consultar perfiles correspondientes en public.profiles
    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)

      if (!profilesError && profiles) {
        const profileMap = new Map(profiles.map(p => [p.id, p]))

        // Mapear los perfiles a cada objeto de obra
        artworks.forEach(art => {
          art.owner_profile = profileMap.get(art.current_owner_id) || null
          art.pending_profile = profileMap.get(art.pending_owner_id) || null
          // Mantener compatibilidad previa
          art.profiles = art.pending_profile || art.owner_profile
        })
      }
    }

    return Response.json({ artworks: artworks || [] })
  } catch (err) {
    console.error('Error en /api/admin/pending-claims:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}