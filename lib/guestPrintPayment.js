import { chargeFor } from './currency.js'

/** Validate paid Stripe lines against the frozen server-validated price manifest.
 * Never trust a browser subtotal, line description, or a Stripe session ID alone.
 * Return canonical MXN accounting total only after every unit matches.
 */
export function validatePaidOpenPrintLines(items, lines, charge, paidTotalCents) {
  if (!Array.isArray(items) || !Array.isArray(lines) || items.length < 1 ||
      items.length > 20 || items.length !== lines.length) throw new Error('print_lines_mismatch')
  const currency = String(charge?.currency || '').toUpperCase()
  if (!['MXN', 'USD'].includes(currency) ||
    (currency === 'USD' && (!Number.isFinite(charge.usdPerMxn) || charge.usdPerMxn <= 0)))
    throw new Error('print_charge_currency_invalid')
  let totalMxn = 0
  let totalCents = 0
  for (const [index, item] of items.entries()) {
    const q = Number(item.quantity)
    const unit = Number(item.unit_mxn)
    if (!Number.isInteger(q) || q < 1 || q > 100 ||
        !Number.isFinite(unit) || unit <= 0 || Number(lines[index]?.quantity) !== q)
      throw new Error('print_line_quantity_invalid')
    const expected = chargeFor(unit, currency, charge.usdPerMxn).cents * q
    if (Number(lines[index]?.amount_total) !== expected ||
        Number(lines[index]?.amount_subtotal) !== expected)
      throw new Error('print_line_price_invalid')
    totalMxn += unit * q
    totalCents += expected
  }
  if (!Number.isInteger(paidTotalCents) || paidTotalCents !== totalCents)
    throw new Error('print_paid_total_invalid')
  return { totalMxn: Math.round(totalMxn * 100) / 100, currency, paidTotalCents }
}
