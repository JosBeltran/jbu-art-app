/**
 * Reconstruye importes MXN de una sesión de Stripe cobrada en MXN o USD.
 * Las funciones de base de datos siguen validando y guardando MXN; la moneda
 * realmente cobrada se registra aparte en orders.charged_*.
 */
import { chargeFor } from './currency.js'

const round2 = (n) => Math.round(n * 100) / 100

/** Moneda y tasa de la sesión. Lanza si la sesión no es coherente. */
export function sessionCharge(session) {
  const currency = String(session?.currency || '').toLowerCase()
  if (currency === 'mxn') return { currency: 'mxn', usdPerMxn: null }
  if (currency !== 'usd') throw new Error('currency_mismatch')
  const m = session?.metadata || {}
  const rate = Number(m.fx_usd_per_mxn)
  if (m.charge_currency !== 'USD' || !Number.isFinite(rate) || rate <= 0) throw new Error('fx_missing')
  return { currency: 'usd', usdPerMxn: rate }
}

/** Precio unitario MXN por línea (tras descuentos) y total MXN. */
export function mxnFulfillment(session, lines) {
  const charge = sessionCharge(session)
  if (charge.currency === 'mxn') {
    const units = lines.map((l) => l.amount_total / 100 / l.quantity)
    return { units, total: session.amount_total / 100, charge }
  }
  let mxn
  try { mxn = JSON.parse(session.metadata.mxn_units) } catch { throw new Error('mxn_units_missing') }
  if (!Array.isArray(mxn) || mxn.length !== lines.length) throw new Error('mxn_units_missing')
  const units = lines.map((l, i) => {
    const base = Number(mxn[i])
    if (!Number.isFinite(base) || base < 0) throw new Error('mxn_units_missing')
    // Cada línea se cobró a dólares enteros; el descuento (si hay) se aplica en proporción.
    const expected = chargeFor(base, 'USD', charge.usdPerMxn).cents * l.quantity
    if (l.amount_subtotal !== expected) throw new Error('amount_mismatch')
    const ratio = l.amount_subtotal > 0 ? l.amount_total / l.amount_subtotal : 0
    return round2(base * ratio)
  })
  const total = round2(units.reduce((acc, u, i) => acc + u * lines[i].quantity, 0))
  return { units, total, charge }
}

/** Importe MXN de un pago pendiente (oferta/ganador) tras verificar lo cobrado. */
export function pendingMxnAmount(session) {
  const charge = sessionCharge(session)
  const m = session.metadata || {}
  if (charge.currency === 'mxn') return { amount: Number(session.amount_total) / 100, charge }
  const amount = Number(m.offer_amount || m.auction_amount)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount_mismatch')
  if (Number(session.amount_total) !== chargeFor(amount, 'USD', charge.usdPerMxn).cents) throw new Error('amount_mismatch')
  return { amount, charge }
}

/** Datos de auditoría de lo realmente cobrado. */
export const chargedColumns = (session, charge) => ({
  charged_currency: charge.currency.toUpperCase(),
  charged_amount: Number(session.amount_total) / 100,
  fx_usd_per_mxn: charge.usdPerMxn,
})
