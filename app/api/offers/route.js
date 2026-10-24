import { NextResponse } from 'next/server'
import {serviceClient,getRequestUser} from '@/lib/offersAuth'
import {offerIdentity} from '@/lib/payments/pending'
import {isArtworkPurchasable} from '@/lib/artworkStatus'

export async function POST(request) {
  try {
    const supabase=serviceClient(),user=await getRequestUser(request,supabase)
    const body = await request.json()
    const { artworkId, name, email, offerAmount, message } = body

    // Validación básica de campos requeridos
    if (!artworkId || !name || !email || !offerAmount) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios para registrar la oferta.' },
        { status: 400 }
      )
    }

    const amount=Number(offerAmount)
    if(!Number.isFinite(amount)||amount<=0||amount>100000000||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim()))return NextResponse.json({error:'Datos de oferta inválidos.'},{status:400})
    // La obra debe permitir ofertas de forma explícita (accepts_offers = true); si no, se rechaza
    const { data: art } = await supabase.from('artworks').select('*').eq('id', artworkId).maybeSingle()
    if (!art) return NextResponse.json({ error: 'Obra no encontrada.' }, { status: 404 })
    if(!isArtworkPurchasable(art))return NextResponse.json({error:'Obra no disponible.'},{status:409})
    if (art.accepts_offers !== true) {
      return NextResponse.json({ error: 'Esta obra no recibe ofertas.' }, { status: 403 })
    }

    // Inserción mapeada a la estructura exacta de la tabla public.artwork_offers
    const { data, error } = await supabase
      .from('artwork_offers')
      .insert([
        {
          artwork_id: artworkId,
          ...offerIdentity(user,email),
          guest_name: name,
          offer_amount_mxn: Math.round(amount*100)/100,
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