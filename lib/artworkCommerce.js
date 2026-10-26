/**
 * Presentación comercial de una obra — fuente única de verdad.
 *
 * Deciden aquí, y solo aquí, si la obra muestra precio, botón Add,
 * «Consultar precio» o estado de vendida. Lo usan catálogo, ficha y Home
 * para que nunca se contradigan.
 *
 * Mientras la migración 20261103 no esté aplicada, price_display_mode no
 * existe: todas las obras caen a SHOW_PRICE y el comportamiento actual se
 * conserva exactamente.
 */

import { getAvailability } from './artworkStatus.js'

export const PRICE_DISPLAY_MODES = ['SHOW_PRICE', 'CONTACT_FOR_PRICE']

const norm = (v) => String(v ?? '').trim().toUpperCase()

/** Modo de presentación del precio configurado en la obra. */
export function getPriceDisplayMode(artwork) {
  const mode = norm(artwork?.price_display_mode)
  return PRICE_DISPLAY_MODES.includes(mode) ? mode : 'SHOW_PRICE'
}

/** Precio público de la obra, o null si no tiene uno válido. */
export function getArtworkPrice(artwork) {
  const amount = Number(artwork?.calculated_price_mxn ?? artwork?.base_price_mxn)
  if (!amount || Number.isNaN(amount) || amount <= 0) return null
  return amount
}

/**
 * Presentación comercial efectiva de una obra.
 *
 * Devuelve:
 *  - availability: disponibilidad de venta (AVAILABLE / SOLD / …)
 *  - priceMode:    SHOW_PRICE | CONTACT_FOR_PRICE
 *  - price:        importe público o null (null también cuando priceMode lo oculta)
 *  - showPrice:    mostrar el precio en la interfaz
 *  - showAdd:      mostrar el botón Add (carrito existente)
 *  - showInquiry:  mostrar «Consultar precio»
 *  - cta:          'ADD' | 'ASK_PRICE' | 'NONE'
 *
 * Reglas:
 *  - SOLD (o cualquier no disponible) nunca muestra Add ni Consultar precio.
 *  - CONTACT_FOR_PRICE nunca expone el precio ni permite Add.
 *  - SHOW_PRICE sin precio válido no muestra Add (no se puede cobrar).
 */
export function getArtworkCommercePresentation(artwork) {
  const availability = getAvailability(artwork)
  const priceMode = getPriceDisplayMode(artwork)
  const available = availability === 'AVAILABLE'
  const rawPrice = getArtworkPrice(artwork)

  const showPrice = available && priceMode === 'SHOW_PRICE' && rawPrice !== null
  const showAdd = available && priceMode === 'SHOW_PRICE' && rawPrice !== null
  const showInquiry = available && priceMode === 'CONTACT_FOR_PRICE'

  return {
    availability,
    priceMode,
    price: showPrice ? rawPrice : null,
    showPrice,
    showAdd,
    showInquiry,
    cta: showAdd ? 'ADD' : showInquiry ? 'ASK_PRICE' : 'NONE',
  }
}
