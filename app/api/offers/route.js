import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export async function POST(request) {
  try {
    const body = await request.json()
    const { artworkId, name, email, offerAmount, message, userId } = body

    // Validación básica de campos requeridos
    if (!artworkId || !name || !email || !offerAmount) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios para registrar la oferta.' },
        { status: 400 }
      )
    }

    // Inserción mapeada a la estructura exacta de la tabla public.artwork_offers
    const { data, error } = await supabase
      .from('artwork_offers')
      .insert([
        {
          artwork_id: artworkId,
          user_id: userId || null,              // UUID del usuario si está logueado, o nulo si es invitado
          guest_name: name,
          guest_email: email,
          offer_amount_mxn: Number(offerAmount),
          message: message || '',
          status: 'PENDING'
        }
      ])
      .select()

    if (error) {
      console.error('Error al insertar en Supabase:', error)
      return NextResponse.json(
        { error: error.message || 'No se pudo guardar la oferta en la base de datos.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('Error en el servidor /api/offers:', err)
    return NextResponse.json(
      { error: 'Error interno del servidor.' },
      { status: 500 }
    )
  }
}