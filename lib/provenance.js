// lib/provenance.js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/**
 * Helper para registrar eventos en la tabla provenance_events
 */
export async function recordProvenanceEvent({ artworkId, eventType, description, amountMxn = null, actorId = null, metadata = {} }) {
  try {
    const payload = {
      artwork_id: artworkId,
      event_type: eventType, // Debe ser un valor válido del ENUM (ej: 'PRIMARY_SALE', 'RESALE', 'CREATED')
      description: description || 'Evento de proveniencia registrado',
      amount_mxn: amountMxn,
      actor_id: actorId, // UUID de public.users o null
      meta_data: metadata
    }

    const { data, error } = await supabase
      .from('provenance_events')
      .insert([payload])
      .select()

    if (error) {
      console.error('❌ Error Supabase en provenance_events:', JSON.stringify(error, null, 2))
      return null
    }

    return data
  } catch (err) {
    console.error('⚠️ Excepción al insertar proveniencia:', err.message)
    return null
  }
}