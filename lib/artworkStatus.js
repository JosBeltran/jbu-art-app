/**
 * Modelo de estatus de obras — fuente única de verdad.
 *
 *  - status              → visibilidad de catálogo / publicación
 *  - availability_status → disponibilidad de venta (compra, ofertas, pujas)
 *  - ownership_status    → ciclo de propiedad y certificado
 *
 * Mientras la migración 20261022 no esté aplicada, availability_status puede
 * no existir: todos los helpers caen al ownership_status histórico para que
 * el comportamiento actual se conserve exactamente.
 */

const SOLD_OWNERSHIP = ['SOLD', 'CLAIM_PENDING', 'CLAIMED', 'VERIFIED']

const norm = (v) => String(v ?? '').trim().toUpperCase()

/** Disponibilidad efectiva de venta de una obra. */
export function getAvailability(artwork) {
  const explicit = norm(artwork?.availability_status)
  if (explicit) return explicit
  const ownership = norm(artwork?.ownership_status)
  if (ownership === 'RESERVED') return 'RESERVED'
  if (SOLD_OWNERSHIP.includes(ownership)) return 'SOLD'
  if (ownership === 'NOT_FOR_SALE') return 'NOT_FOR_SALE'
  return 'AVAILABLE'
}

/** Compra directa permitida solo cuando la disponibilidad es AVAILABLE. */
export function isArtworkPurchasable(artwork) {
  return getAvailability(artwork) === 'AVAILABLE'
}

/**
 * Elegibilidad de reclamación de certificado (servidor).
 * Una obra vendida NUNCA necesita volver a AVAILABLE para ser reclamada.
 * hasActiveClaim / hasActiveBatch los aporta el llamador tras consultar
 * order_items / tokens vivos.
 */
export function isArtworkClaimEligible(artwork, { hasActiveClaim = false, hasActiveBatch = false } = {}) {
  if (!artwork) return false
  return (
    getAvailability(artwork) === 'SOLD' &&
    norm(artwork.ownership_status) === 'SOLD' &&
    !artwork.current_owner_id &&
    !artwork.pending_owner_id &&
    !hasActiveClaim &&
    !hasActiveBatch
  )
}

/** Combinación contradictoria heredada: revisar a mano, nunca comprable. */
export function needsStatusReview(artwork) {
  return (
    norm(artwork?.status) === 'OWNED' &&
    norm(artwork?.ownership_status) === 'AVAILABLE' &&
    Boolean(artwork?.current_owner_id)
  )
}

/**
 * Etiqueta pública de la obra, derivada de disponibilidad + propiedad.
 * Nunca se deriva de `ownership_status || status`.
 */
export function publicStatusLabel(artwork, t) {
  const tr = typeof t === 'function' ? t : (es, en) => es
  const availability = getAvailability(artwork)
  const ownership = norm(artwork?.ownership_status)
  if (needsStatusReview(artwork)) return tr('No a la venta', 'Not for Sale')
  switch (availability) {
    case 'AVAILABLE':
      return tr('Disponible', 'Available')
    case 'RESERVED':
      return tr('Reservada', 'Reserved')
    case 'NOT_FOR_SALE':
      return tr('No a la venta', 'Not for Sale')
    case 'SOLD':
    default:
      return ownership === 'VERIFIED' || artwork?.current_owner_id
        ? tr('Colección privada', 'Private Collection')
        : tr('Vendida', 'Sold')
  }
}
