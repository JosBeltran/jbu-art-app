import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export async function POST(req) {
  try {
    const { artworkId, userId } = await req.json()

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const supabase = createClient(supabaseUrl, supabaseKey)

    const timestamp = new Date().toISOString()
    const secretKey = process.env.CERTIFICATE_SECRET_KEY || 'jbu-secret-2026'

    // Generación del Hash criptográfico inalterable
    const rawData = `${artworkId}-${userId}-${timestamp}-${secretKey}`
    const certificateHash = crypto.createHash('sha256').update(rawData).digest('hex')

    // 1. Guardar en la tabla artworks
    const { error: artError } = await supabase
      .from('artworks')
      .update({
        current_owner_id: userId,
        ownership_status: 'VERIFIED',
        certificate_hash: certificateHash,
        certificate_issued_at: timestamp
      })
      .eq('id', artworkId)

    if (artError) throw artError

    // 2. Registrar automáticamente el evento en la tabla de proveniencia
    await supabase.from('provenance_events').insert([{
      artwork_id: artworkId,
      event_type: 'OWNERSHIP_TRANSFER',
      event_date: timestamp.split('T')[0],
      title: 'Certificado Emitido y Propiedad Registrada',
      description: `Propiedad verificada digitalmente. Hash de Autenticidad: ${certificateHash.substring(0, 16)}...`
    }])

    return Response.json({ success: true, certificateHash })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}