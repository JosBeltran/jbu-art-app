import { Resend } from 'resend'

// Inicializamos Resend con la API Key (si existe)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

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
    .map(art => `<li style="margin-bottom: 6px;"><strong>${art.title}</strong> (SKU: <code>${art.sku}</code>)</li>`)
    .join('')

  try {
    await resend.emails.send({
      from: 'Estudio JBU <onboarding@resend.dev>',
      to: [collectorEmail],
      subject: `Confirmación de Pedido #${shortOrderId} — Estudio JBU`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background-color: #0a0a0a; color: #f5f5f5; padding: 32px; border-radius: 12px; border: 1px solid #262626;">
          <div style="font-family: monospace; font-size: 11px; color: #f59e0b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
            Pago Confirmado
          </div>
          <h2 style="font-family: Georgia, serif; font-weight: normal; color: #ffffff; margin-top: 0; margin-bottom: 16px;">
            Orden #${shortOrderId}
          </h2>
          <p style="color: #a3a3a3; font-size: 14px; line-height: 1.6;">
            ¡Muchas gracias por tu compra! Hemos recibido el pago por un total de <strong>$${totalAmount.toLocaleString('es-MX')} MXN</strong>.
          </p>

          <div style="background-color: #171717; border: 1px solid #262626; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <div style="font-size: 12px; color: #a3a3a3; font-family: monospace; text-transform: uppercase; margin-bottom: 8px;">
              Obras Adquiridas (${artworks.length})
            </div>
            <ul style="color: #f5f5f5; font-size: 14px; padding-left: 20px; margin: 0;">
              ${artworksHtmlList}
            </ul>
          </div>

          <p style="color: #a3a3a3; font-size: 14px; line-height: 1.6;">
            Puedes dar seguimiento al paquete y reclamar los certificados de autenticidad de cada obra desde tu panel de orden:
          </p>

          <div style="margin: 32px 0; text-align: center;">
            <a href="${orderUrl}" style="background-color: #ffffff; color: #0a0a0a; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">
              Ver Estado de Pedido y Certificados ↗
            </a>
          </div>

          <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #262626; text-align: center; color: #737373; font-size: 12px;">
            Josué Beltrán Uresti — Estudio de Arte
          </div>
        </div>
      `,
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
    const subject = `¡Gracias por tu compra! Reclama tu certificado: ${title} (${sku})`

    try {
      await resend.emails.send({
        from: 'Estudio JBU <onboarding@resend.dev>',
        to: [collectorEmail],
        subject: subject,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background-color: #0a0a0a; color: #f5f5f5; padding: 32px; border-radius: 12px; border: 1px solid #262626;">
            <h2 style="font-family: Georgia, serif; font-weight: normal; color: #ffffff; margin-bottom: 16px;">¡Gracias por tu adquisición!</h2>
            <p style="color: #a3a3a3; font-size: 14px; line-height: 1.6;">
              Hemos confirmado la compra de la obra <strong>${title}</strong> (SKU: <code>${sku}</code>).
            </p>
            <p style="color: #a3a3a3; font-size: 14px; line-height: 1.6;">
              Haz clic en el siguiente botón para vincular la obra a tu cuenta de coleccionista y solicitar tu Certificado de Autenticidad:
            </p>
            
            <div style="margin: 32px 0; text-align: center;">
              <a href="${claimUrl}" style="background-color: #ffffff; color: #0a0a0a; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">
                Vincular y Reclamar Obra
              </a>
            </div>

            ${claimToken ? `
              <p style="color: #737373; font-size: 12px; text-align: center;">
                Tu Claim Token manual en caso de requerirlo: <strong style="color: #ffffff;">${claimToken}</strong>
              </p>
            ` : ''}

            <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #262626; text-align: center; color: #737373; font-size: 12px;">
              Josué Beltrán Uresti — Estudio de Arte
            </div>
          </div>
        `,
      })
      console.log(`✅ Correo con botón de reclamo enviado exitosamente a ${collectorEmail}`)
      return
    } catch (error) {
      console.error('Error enviando correo de reclamo por compra:', error)
      return
    }
  }

  // B) CASO REGISTRO MANUAL O SOLICITUD DESDE EL SITIO
  try {
    await resend.emails.send({
      from: 'Estudio JBU <onboarding@resend.dev>',
      to: [collectorEmail],
      subject: `Solicitud de registro recibida: ${title} (${sku})`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background-color: #0a0a0a; color: #f5f5f5; padding: 32px; border-radius: 12px; border: 1px solid #262626;">
          <h2 style="font-family: Georgia, serif; font-weight: normal; color: #ffffff; margin-bottom: 16px;">Solicitud de Registro de Obra</h2>
          <p style="color: #a3a3a3; font-size: 14px; line-height: 1.6;">
            Hemos recibido tu solicitud para registrar la obra <strong>${title}</strong> (SKU: <code>${sku}</code>) en tu colección privada.
          </p>
          <p style="color: #a3a3a3; font-size: 14px; line-height: 1.6;">
            El certificado de autenticidad se encuentra actualmente en proceso de revisión y firma digital por el estudio del artista.
          </p>
          <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #262626; text-align: center; color: #737373; font-size: 12px;">
            Josué Beltrán Uresti — Estudio de Arte
          </div>
        </div>
      `,
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
  const pdfUrl = `${appUrl}/api/certificates/pdf?sku=${sku}`
  const verifyUrl = `${appUrl}/verify/${sku}`

  try {
    await resend.emails.send({
      from: 'Estudio JBU <onboarding@resend.dev>',
      to: [collectorEmail],
      subject: `Certificado de Autenticidad Emitido: ${title}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background-color: #0a0a0a; color: #f5f5f5; padding: 32px; border-radius: 12px; border: 1px solid #262626;">
          <h2 style="font-family: Georgia, serif; font-weight: normal; color: #f59e0b; margin-bottom: 16px;">Certificado de Autenticidad Firmado</h2>
          <p style="color: #d4d4d4; font-size: 14px; line-height: 1.6;">
            La autenticidad y propiedad de la obra <strong>${title}</strong> (SKU: <code>${sku}</code>) ha sido verificada y registrada exitosamente.
          </p>
          <div style="margin: 28px 0; text-align: center;">
            <a href="${pdfUrl}" style="background-color: #f59e0b; color: #000000; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px; display: inline-block; margin-right: 8px;">
              Descargar Certificado (PDF)
            </a>
            <a href="${verifyUrl}" style="background-color: #262626; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px; display: inline-block;">
              Ver Proveniencia Pública
            </a>
          </div>
          <p style="color: #737373; font-size: 12px; line-height: 1.5;">
            Este certificado cuenta con respaldo de huella criptográfica SHA-256 para verificación permanente de proveniencia.
          </p>
          <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #262626; text-align: center; color: #737373; font-size: 12px;">
            Josué Beltrán Uresti — Estudio de Arte
          </div>
        </div>
      `,
    })
  } catch (error) {
    console.error('Error enviando correo de certificado emitido:', error)
  }
}