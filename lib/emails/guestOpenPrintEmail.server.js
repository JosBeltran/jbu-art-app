import { Resend } from 'resend'

const escape = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// No collector-ownership or certificate claims in Open Edition confirmations.
// Resend's idempotency key prevents repeat transmissions after webhook retries.
export async function sendGuestOpenPrintEmail({ email, order, items, url }) {
  if (process.env.DISABLE_TRANSACTIONAL_EMAILS === 'true') return { disabled: true }
  if (!process.env.RESEND_API_KEY) throw new Error('email_provider_not_configured')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const currency = order.charged_currency || 'MXN'
  const amount = Number(order.charged_amount ?? order.total_amount_mxn).toFixed(2)
  const lines = items.map(i => '<li>' + escape(i.title_snapshot) + ' · ' +
    escape(i.print_size_snapshot) + ' · ' + escape(i.print_finish_snapshot) +
    ' · ×' + Number(i.quantity) + '</li>').join('')
  const address = order.shipping_address || {}
  const addressText = [address.line1, address.line2, address.city, address.state, address.postal_code, address.country]
    .filter(Boolean).join(', ')
  const html = '<html><body><h1>Tu compra en Estudio JBU está confirmada / Your Estudio JBU order is confirmed</h1>' +
    '<p>Gracias por tu compra. Tu pago está confirmado. La producción de tus reproducciones está pendiente.</p>' +
    '<p>Thank you for your purchase. Your payment is confirmed. Your prints have not yet entered production.</p>' +
    '<p>Pedido / Order #' + escape(order.id.slice(0, 8).toUpperCase()) + '</p><ul>' + lines + '</ul>' +
    '<p>Total: ' + escape(currency) + ' ' + escape(amount) + '</p>' +
    '<p>Entrega / Delivery: ' + escape(addressText) + '</p>' +
    '<p><a href="' + escape(url) + '">Consultar pedido / View order</a></p></body></html>'
  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'JBU <notifications@josuebeltranuresti.com>',
    to: [email],
    subject: 'Tu compra en Estudio JBU está confirmada / Your Estudio JBU order is confirmed',
    html,
  }, { idempotencyKey: 'guest-open-prints/' + order.id })
  if (result.error) throw new Error(result.error.message)
  return { sent: true }
}
