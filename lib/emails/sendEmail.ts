import { Resend } from 'resend'

// Inicializamos Resend con la API Key (si existe)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// 1. Correo que recibe el coleccionista cuando pide registrar su obra
export async function sendClaimNotificationEmail(collectorEmail: string, title: string, sku: string) {
  if (!resend) {
    console.log(`[EMAIL SIMULADO] Notificación de solicitud a ${collectorEmail} para la obra "${title}" (${sku})`)
    return
  }

  try {
    await resend.emails.send({
      from: 'Estudio JBU <onboarding@resend.dev>', // Usamos el dominio de prueba predeterminado de Resend
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
    console.error('Error enviando correo de reclamo:', error)
  }
}

// 2. Correo que recibe el coleccionista cuando TÚ autorizas la obra desde el panel Admin
export async function sendCertificateIssuedEmail(collectorEmail: string, title: string, sku: string) {
  if (!resend) {
    console.log(`[EMAIL SIMULADO] Certificado emitido a ${collectorEmail} para la obra "${title}" (${sku})`)
    return
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
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