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

    // 2. Extraer parámetros
    const body = await req.json()
    const sku = body.sku || body.artworkId
    const claimToken = body.claim_token?.trim()
    const userMessage = body.user_message?.trim()
    const hasToken = body.has_token ?? Boolean(claimToken)

    if (!sku) {
      return Response.json(
        { message: 'Debes proporcionar la clave / SKU de la obra.' },
        { status: 400 }
      )
    }

    // 3. Cliente Service Role para bypass de RLS
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false } }
    )

    const cleanSku = sku.trim()

    // Buscar obra por SKU o ID
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

    // Sincronizar Perfil del Usuario
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

    // 4. LÓGICA DE RECLAMO

    if (hasToken) {
      // CASO A: VIENE CON CLAIM TOKEN
      if (!claimToken) {
        return Response.json(
          { message: 'Por favor ingresa un Claim Token válido.' },
          { status: 400 }
        )
      }

      // Validar si la obra requiere token y si coincide exactamente
      if (artwork.claim_token && artwork.claim_token.trim() !== claimToken) {
        return Response.json(
          { message: 'El Claim Token proporcionado es incorrecto o ha expirado.' },
          { status: 400 }
        )
      }

      // Marcar como CLAIM_PENDING con el comprador asignado a pending_owner_id
      // Se limpia el claim_token para evitar doble reclamo
      const { error: updateError } = await supabaseAdmin
        .from('artworks')
        .update({
          pending_owner_id: user.id,
          ownership_status: 'CLAIM_PENDING',
          claim_token: null,
          claim_notes: `Token verificado (${user.email}). Esperando firma del artista.`,
          updated_at: new Date().toISOString()
        })
        .eq('id', artwork.id)

      if (updateError) throw updateError

      // Notificación
      try {
        await sendClaimNotificationEmail(user.email, artwork.title || artwork.sku, artwork.sku, {
          approved: false,
          hasToken: true
        })
      } catch (e) { console.error('Error enviando mail:', e) }

      return Response.json({
        success: true,
        status: 'CLAIM_PENDING',
        message: '¡Token verificado con éxito! La solicitud fue enviada al artista para la firma digital final de tu certificado.'
      })

    } else {
      // CASO B: MENSAJE LIBRE / VERIFICACIÓN MANUAL
      if (!userMessage) {
        return Response.json(
          { message: 'Debes incluir un mensaje explicando cómo/cuándo adquiriste la obra.' },
          { status: 400 }
        )
      }

      const { error: updateError } = await supabaseAdmin
        .from('artworks')
        .update({
          pending_owner_id: user.id,
          ownership_status: 'CLAIM_PENDING',
          claim_notes: userMessage,
          updated_at: new Date().toISOString()
        })
        .eq('id', artwork.id)

      if (updateError) throw updateError

      try {
        await sendClaimNotificationEmail(user.email, artwork.title || artwork.sku, artwork.sku, {
          approved: false,
          hasToken: false,
          userMessage
        })
      } catch (e) { console.error('Error enviando mail:', e) }

      return Response.json({
        success: true,
        status: 'CLAIM_PENDING',
        message: 'Tu solicitud de reclamación fue recibida por el Estudio JBU. Revisaremos los datos para autorizar tu certificado.'
      })
    }

  } catch (err) {
    console.error('Error en /api/artworks/claim:', err)
    return Response.json({ message: err.message || 'Error interno del servidor' }, { status: 500 })
  }
}