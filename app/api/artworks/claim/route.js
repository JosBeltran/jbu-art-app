import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { sendClaimNotificationEmail } from '@/lib/emails/sendEmail'

export async function POST(req) {
  try {
    // 1. Validar sesión del usuario con SSR
    const cookieStore = await cookies()
    const supabaseUserClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user } } = await supabaseUserClient.auth.getUser()

    if (!user) {
      return Response.json(
        { message: 'Debes iniciar sesión para reclamar una obra.' },
        { status: 401 }
      )
    }

    // 2. Extraer parámetros del cuerpo de la petición
    const body = await req.json()
    const sku = body.sku || body.artworkId
    const claimToken = body.claim_token
    const userMessage = body.user_message
    const hasToken = body.has_token ?? Boolean(claimToken)

    if (!sku) {
      return Response.json(
        { message: 'Debes proporcionar la clave / SKU de la obra.' },
        { status: 400 }
      )
    }

    // 3. Crear cliente con Service Role para bypass de RLS
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false } }
    )

    const cleanSku = sku.trim()

    // Buscar la obra por SKU o ID
    let { data: artwork } = await supabaseAdmin
      .from('artworks')
      .select('*')
      .ilike('sku', cleanSku)
      .maybeSingle()

    if (!artwork && cleanSku.length === 36) {
      const { data: artworkById } = await supabaseAdmin
        .from('artworks')
        .select('*')
        .eq('id', cleanSku)
        .maybeSingle()
      
      artwork = artworkById
    }

    if (!artwork) {
      return Response.json(
        { message: `No se encontró ninguna obra registrada con la clave "${sku}".` },
        { status: 404 }
      )
    }

    // Sincronizar/Upsert Perfil
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Coleccionista'
      }, { onConflict: 'id' })

    if (profileError) {
      console.error('Error sincronizando perfil:', profileError)
    }

    // 4. LÓGICA BIFURCADA:
    if (hasToken) {
      // CASO A: VIENE CON CLAIM TOKEN
      // Validar si la obra tiene un token asignado y si coincide
      if (artwork.claim_token && artwork.claim_token.trim() !== claimToken?.trim()) {
        return Response.json(
          { message: 'El Claim Token proporcionado es incorrecto.' },
          { status: 400 }
        )
      }

      // Si coincide o la obra no requería token estricto, la reclamación se Aprueba Inmediatamente
      const { error: updateError } = await supabaseAdmin
        .from('artworks')
        .update({
          current_owner_id: user.id,
          ownership_status: 'CLAIMED',
          claimed_at: new Date().toISOString()
        })
        .eq('id', artwork.id)

      if (updateError) throw updateError

      // Notificación por correo
      try {
        await sendClaimNotificationEmail(user.email, artwork.title || artwork.sku, artwork.sku, {
          approved: true,
          hasToken: true
        })
      } catch (e) { console.error(e) }

      return Response.json({
        success: true,
        status: 'CLAIMED',
        message: '¡Obra vinculada con éxito a tu colección!'
      })

    } else {
      // CASO B: NO TIENE TOKEN (Mensaje para Aprobación Manual del Artista)
      // NO asignamos `current_owner_id` todavía para que NO aparezca como verificada en su colección.
      const { error: updateError } = await supabaseAdmin
        .from('artworks')
        .update({
          ownership_status: 'CLAIM_PENDING',
          pending_owner_id: user.id, // O guardamos en claim_notes quién la solicita
          claim_notes: userMessage || 'Solicitud enviada sin token'
        })
        .eq('id', artwork.id)

      if (updateError) throw updateError

      // Notificar al artista/admin que hay una solicitud pendiente de aprobación
      try {
        await sendClaimNotificationEmail(user.email, artwork.title || artwork.sku, artwork.sku, {
          approved: false,
          hasToken: false,
          userMessage
        })
      } catch (e) { console.error(e) }

      return Response.json({
        success: true,
        status: 'CLAIM_PENDING',
        message: 'Tu mensaje fue recibido. Revisaremos la información para aprobar tu certificado.'
      })
    }

  } catch (err) {
    console.error('Error en /api/artworks/claim:', err)
    return Response.json({ message: err.message || 'Error interno del servidor' }, { status: 500 })
  }
}