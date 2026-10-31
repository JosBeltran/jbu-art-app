import { Resend } from 'resend'

// Inicializamos Resend con la API Key (si existe)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// Remitente transaccional. El dominio josuebeltranuresti.com debe estar verificado en Resend.
// Las direcciones de envío no requieren buzón real; son identidades autenticadas del dominio.
// Configurable por entorno: RESEND_FROM_EMAIL='JBU <notifications@josuebeltranuresti.com>'
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'JBU <notifications@josuebeltranuresti.com>'

// No existe un buzón de respuesta real en el dominio todavía; no se configura Reply-To.
// Cuando exista (p. ej. studio@josuebeltranuresti.com), definir RESEND_REPLY_TO_EMAIL.
const REPLY_TO = process.env.RESEND_REPLY_TO_EMAIL || undefined

interface OrderEmailOptions {
  orderId: string
  orderUrl: string
  totalAmount: number
  artworks: Array<{ title: string; sku: string }>
}

interface ClaimOptions {
  claimUrl?: string
  claimToken?: string
  isPurchaseConfirmation?: boolean
  approved?: boolean
  hasToken?: boolean
  userMessage?: string
}

// ——— Plantilla editorial clara compartida (email-safe, una columna, sin CSS moderno) ———
function emailShell({
  preheader,
  eyebrow,
  heading,
  body,
  language = 'es',
}: {
  preheader: string
  eyebrow: string
  heading: string
  body: string
  language?: string
}) {
  return `<!DOCTYPE html>
<html lang="${language}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background-color:#f7f5f2;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f5f2;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border:1px solid #e5e0d8;">
        <tr><td style="padding:32px 40px 0 40px; font-family:Georgia, 'Times New Roman', serif; font-size:20px; letter-spacing:4px; color:#111111;">
          JBU
        </td></tr>
        <tr><td style="padding:24px 40px 0 40px; font-family:Arial, Helvetica, sans-serif; font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#6b5ce7;">
          ${eyebrow}
        </td></tr>
        <tr><td style="padding:8px 40px 0 40px; font-family:Georgia, 'Times New Roman', serif; font-size:26px; line-height:1.3; color:#111111;">
          ${heading}
        </td></tr>
        <tr><td style="padding:20px 40px 8px 40px; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:1.7; color:#3d3d3d;">
          ${body}
        </td></tr>
        <tr><td style="padding:24px 40px 32px 40px; border-top:1px solid #e5e0d8; font-family:Arial, Helvetica, sans-serif; font-size:11px; line-height:1.6; color:#8a8580;">
          Josué Beltrán Uresti<br>
          JBU — Contemporary Art Platform<br>
          <a href="https://www.josuebeltranuresti.com" style="color:#8a8580; text-decoration:underline;">josuebeltranuresti.com</a><br><br>
          Este es un mensaje transaccional relacionado con tu compra.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function ctaButton(url: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr><td style="background-color:#111111;">
    <a href="${url}" style="display:inline-block; padding:14px 32px; font-family:Arial, Helvetica, sans-serif; font-size:13px; letter-spacing:1px; text-transform:uppercase; color:#ffffff; text-decoration:none;">${label}</a>
  </td></tr></table>`
}

// 0. Correo principal de Confirmación de Orden y Seguimiento (Manda a /orders/[id])
export async function sendOrderConfirmationEmail(
  collectorEmail: string,
  options: OrderEmailOptions
) {
  const { orderId, orderUrl, totalAmount, artworks } = options
  const shortOrderId = orderId.slice(0, 8).toUpperCase()

  if (!resend) {
    console.log(`[EMAIL SIMULADO] Confirmación de Orden #${shortOrderId} a ${collectorEmail}`)
    return
  }

  const artworksHtmlList = artworks
    .map(
      art =>
        `<tr><td style="padding:10px 0; border-bottom:1px solid #eee9e2; font-size:14px; color:#111111;"><strong>${art.title}</strong><br><span style="font-size:12px; color:#8a8580;">SKU ${art.sku}</span></td></tr>`
    )
    .join('')

  const body = `
    <p style="margin:0 0 16px 0;">Gracias por tu adquisición.</p>
    <p style="margin:0 0 4px 0; font-size:12px; color:#8a8580; text-transform:uppercase; letter-spacing:1px;">Pedido #${shortOrderId}</p>
    <p style="margin:0 0 24px 0; font-size:20px; color:#111111;">Total &nbsp;MXN $${totalAmount.toLocaleString('es-MX')}</p>
    <p style="margin:0 0 8px 0; font-size:12px; color:#8a8580; text-transform:uppercase; letter-spacing:1px;">Obras adquiridas</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">${artworksHtmlList}</table>
    <p style="margin:0 0 8px 0;">Tu obra se ha añadido a tu colección. Puedes seguir el estado del pedido y acceder a su Certificado de Autenticidad digital desde tu cuenta JBU.</p>
    ${ctaButton(orderUrl, 'Ver tu pedido')}
  `

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
      to: [collectorEmail],
      subject: `Tu adquisición JBU está confirmada — Pedido #${shortOrderId}`,
      html: emailShell({
        preheader: 'Tu compra JBU ha sido confirmada. Consulta los detalles de tu pedido y certificado.',
        eyebrow: 'Pago confirmado',
        heading: 'Gracias por tu adquisición',
        body,
      }),
    })
    console.log(`✅ Correo de seguimiento enviado exitosamente a ${collectorEmail}`)
  } catch (error) {
    console.error('Error enviando correo de confirmación de orden:', error)
  }
}

// 1. Correo de notificación / confirmación de compra para reclamar obra
export async function sendClaimNotificationEmail(
  collectorEmail: string,
  title: string,
  sku: string,
  options: ClaimOptions = {}
) {
  if (!resend) {
    console.log(`[EMAIL SIMULADO] Notificación a ${collectorEmail} para la obra "${title}" (${sku})`)
    return
  }

  const { claimUrl, claimToken, isPurchaseConfirmation } = options

  // A) CASO COMPRA VÍA STRIPE: Enviar correo con botón directo para Reclamar
  if (isPurchaseConfirmation || claimUrl) {
    const subject = `Tu adquisición JBU: ${title} (${sku})`

    const body = `
      <p style="margin:0 0 16px 0;">Hemos confirmado la compra de la obra <strong>${title}</strong> <span style="font-size:12px; color:#8a8580;">(SKU ${sku})</span>.</p>
      <p style="margin:0 0 8px 0;">Vincula la obra a tu cuenta de coleccionista y solicita su Certificado de Autenticidad:</p>
      ${ctaButton(claimUrl || '#', 'Vincular y reclamar obra')}
      ${
        claimToken
          ? `<p style="margin:16px 0 0 0; font-size:12px; color:#8a8580;">Tu código de reclamo manual, en caso de requerirlo: <strong style="color:#111111;">${claimToken}</strong></p>`
          : ''
      }
    `

    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        replyTo: REPLY_TO,
        to: [collectorEmail],
        subject: subject,
        html: emailShell({
          preheader: `La obra ${title} ya es tuya. Vincúlala a tu cuenta y solicita su certificado.`,
          eyebrow: 'Pago confirmado',
          heading: 'Gracias por tu adquisición',
          body,
        }),
      })
      console.log(`✅ Correo con botón de reclamo enviado exitosamente a ${collectorEmail}`)
      return
    } catch (error) {
      console.error('Error enviando correo de reclamo por compra:', error)
      return
    }
  }

  // B) CASO REGISTRO MANUAL O SOLICITUD DESDE EL SITIO
  const body = `
    <p style="margin:0 0 16px 0;">Hemos recibido tu solicitud para registrar la obra <strong>${title}</strong> <span style="font-size:12px; color:#8a8580;">(SKU ${sku})</span> en tu colección privada.</p>
    <p style="margin:0;">El Certificado de Autenticidad se encuentra en proceso de revisión y firma por el estudio del artista.</p>
  `

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
      to: [collectorEmail],
      subject: `Solicitud de registro recibida: ${title} (${sku})`,
      html: emailShell({
        preheader: `Recibimos tu solicitud de registro para la obra ${title}.`,
        eyebrow: 'Solicitud recibida',
        heading: 'Registro de obra',
        body,
      }),
    })
  } catch (error) {
    console.error('Error enviando correo de solicitud:', error)
  }
}

// 2. Correo que recibe el coleccionista cuando TÚ autorizas la obra desde el panel Admin
export async function sendCertificateIssuedEmail(collectorEmail: string, title: string, sku: string) {
  if (!resend) {
    console.log(`[EMAIL SIMULADO] Certificado emitido a ${collectorEmail} para la obra "${title}" (${sku})`)
    return
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const verifyUrl = `${appUrl}/verify/${encodeURIComponent(sku)}`

  const body = `
    <p style="margin:0 0 16px 0;">La autenticidad y propiedad de la obra <strong>${title}</strong> <span style="font-size:12px; color:#8a8580;">(SKU ${sku})</span> ha sido verificada y registrada.</p>
    ${ctaButton(verifyUrl, 'Ver y descargar certificado oficial')}
    <p style="margin:0 0 16px 0; font-size:13px;">Inicia sesión con tu cuenta para descargar el PDF oficial firmado.</p>
    <p style="margin:0; font-size:12px; color:#8a8580;">Este certificado cuenta con una huella SHA-256 del registro para la verificación permanente de su proveniencia.</p>
  `

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
      to: [collectorEmail],
      subject: `Certificado de Autenticidad emitido: ${title}`,
      html: emailShell({
        preheader: `El Certificado de Autenticidad de ${title} ya está disponible.`,
        eyebrow: 'Certificado emitido',
        heading: 'Certificado de Autenticidad',
        body,
      }),
    })
  } catch (error) {
    console.error('Error enviando correo de certificado emitido:', error)
  }
}

export async function sendNotificationEmail(row:{id:string;kind:string;recipient_email:string;title_es:string;title_en?:string;body_es?:string;body_en?:string;email_locale?:string;href:string}){
 if(!resend)throw new Error('RESEND_API_KEY is not configured')
 const escape=(v:string)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c))
 const en=row.email_locale==='en',title=en?(row.title_en||row.title_es):row.title_es,body=en?row.body_en:row.body_es
 const result=await resend.emails.send({from:FROM_EMAIL,replyTo:REPLY_TO,to:[row.recipient_email],subject:title,html:emailShell({language:en?'en':'es',preheader:escape(title),eyebrow:'JBU',heading:escape(title),body:(body?`<p>${escape(body)}</p>`:'')+ctaButton(new URL(row.href,'https://www.josuebeltranuresti.com').href,row.kind.startsWith('LOCAL_')?(en?'View order':'Ver pedido'):row.kind==='OFFER_ACCEPTED'?'Ver obra y completar compra':'Ver obra')})},{idempotencyKey:`notification/${row.id}`})
 if(result.error)throw new Error(result.error.message)
}
