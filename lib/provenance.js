// lib/provenance.js — servicio central de procedencia (solo servidor).
// Toda inserción automática pasa por public.record_provenance (idempotente por dedupe_key).
// Nunca lanza: un fallo de procedencia no debe afectar pagos, órdenes ni certificados.
import { createClient } from '@supabase/supabase-js'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

const monthKey = (d = new Date()) => d.toISOString().slice(0, 7)

export async function recordSystemEvent({ artworkId, eventType, title, description, eventDate = null, precision = null, referenceType = null, referenceId = null, dedupeKey = null, visibility = 'PUBLIC', metadata = {} }, client = null) {
  try {
    const { data, error } = await (client || db()).rpc('record_provenance', {
      _artwork: artworkId, _type: eventType, _title: title, _description: description,
      _event_date: eventDate, _precision: precision, _reference_type: referenceType,
      _reference_id: referenceId != null ? String(referenceId) : null, _dedupe: dedupeKey,
      _visibility: visibility, _metadata: metadata, _source: 'SYSTEM'
    })
    if (error) { console.error('⚠️ Procedencia no registrada (reintentable):', eventType, error.message); return null }
    return data
  } catch (err) {
    console.error('⚠️ Excepción en procedencia:', eventType, err?.message)
    return null
  }
}

/** Venta confirmada (después del pago, la orden y el cierre de la venta). Sin datos del comprador. */
export async function recordArtworkSold({ artworkId, orderId, auction = null, paymentMethod = null }, client = null) {
  const sb = client || db()
  let title = 'Acquired by a private collector'
  let description = 'Acquired through JBU following a direct online purchase and entered into a private collection.'
  const metadata = {}
  if (paymentMethod === 'payment_on_delivery') description = 'Acquired through JBU following payment collected upon local delivery; entered into a private collection.'
  if (auction?.id) {
    try {
      const { data: a } = await sb.from('auctions').select('id, lot_number, auction_event_id, auction_events(name)').eq('id', auction.id).maybeSingle()
      const lot = a?.lot_number ? `Lot ${String(a.lot_number).padStart(2, '0')}` : null
      const ev = a?.auction_events?.name
      title = 'Acquired at auction'
      description = auction.saleType === 'BUY_NOW'
        ? `Acquired via Buy Now${lot ? ` as ${lot}` : ''}${ev ? ` in ${ev}` : ''}; entered into a private collection.`
        : `Sold${lot ? ` as ${lot}` : ''}${ev ? ` in ${ev}` : ' at auction'}; entered into a private collection.`
      Object.assign(metadata, { auction_id: a?.id, auction_event_id: a?.auction_event_id, lot_number: a?.lot_number, sale_type: auction.saleType })
    } catch {}
  }
  return recordSystemEvent({
    artworkId, eventType: 'SOLD', title, description, eventDate: monthKey(), precision: 'MONTH',
    referenceType: 'ORDER', referenceId: orderId, dedupeKey: `SOLD:${artworkId}:${orderId}`, metadata
  }, sb)
}

/** Futuro flujo de reventa: compatible, sin implementar el flujo. */
export async function recordOwnershipTransferred({ artworkId, transferId }, client = null) {
  return recordSystemEvent({
    artworkId, eventType: 'OWNERSHIP_TRANSFERRED', title: 'Transferred to a new private collection',
    description: 'Ownership was transferred through the JBU platform and recorded in the artwork provenance.',
    eventDate: monthKey(), precision: 'MONTH', referenceType: 'TRANSFER', referenceId: transferId,
    dedupeKey: `OWNERSHIP_TRANSFERRED:${artworkId}:${transferId}`
  }, client)
}

// Creación, lote, apertura/cierre de subasta y certificado se registran con triggers en la base
// (migración 20261017) para cubrir cualquier camino que modifique esos datos.

/** Compatibilidad con llamadas antiguas: eventos operativos quedan solo para admin. */
export async function recordProvenanceEvent({ artworkId, eventType, description, metadata = {} }) {
  return recordSystemEvent({ artworkId, eventType: eventType || 'PRICE_CHANGED', title: eventType || 'Update', description, visibility: 'ADMIN_ONLY', metadata })
}
