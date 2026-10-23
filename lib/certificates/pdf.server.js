// PDF oficial del certificado (PDFKit, servidor). Se genera UNA vez desde la fila de certificates,
// se guarda en Storage privado y su SHA-256 se calcula sobre los bytes definitivos almacenados.
import { createHash } from 'node:crypto'
import { HttpError } from './adminAuth.server.js'
import { certificateVerifyUrl } from './public.js'
import { SITE_URL } from '../share.js'

export const CERTIFICATE_BUCKET = 'certificates'
export const ASSET_BUCKET = 'certificate-assets'
export const DEFAULT_SIGNATURE_PATH = 'signature/artist-signature.png'

export const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex')
export const certificatePdfPath = (certificate) => `${certificate.id}/coa-v${certificate.version || 1}.pdf`

async function toBuffer(blob) {
  if (!blob) return null
  if (Buffer.isBuffer(blob)) return blob
  return Buffer.from(await blob.arrayBuffer())
}

/** Firma real digitalizada del artista, desde el bucket privado. Nunca generada. */
export async function loadSignature(db) {
  const path = process.env.CERTIFICATE_SIGNATURE_PATH || DEFAULT_SIGNATURE_PATH
  const { data, error } = await db.storage.from(ASSET_BUCKET).download(path)
  if (error || !data) throw new HttpError(409, 'signature_missing')
  const { default: sharp } = await import('sharp')
  return sharp(await toBuffer(data)).png().toBuffer()
}

/** Imagen congelada en el snapshot (primary_image_url), normalizada a JPEG para PDFKit. */
const STORAGE_URL = /\/storage\/v1\/object\/(?:public\/)?([^/]+)\/(.+)$/

// Si la URL apunta al almacenamiento del proyecto, se descarga con la clave de servicio:
// funciona aunque el bucket sea privado o la URL pública falle.
async function downloadStorageObject(db, url) {
  if (!db) return null
  const match = STORAGE_URL.exec(String(url))
  if (!match) return null
  const { data, error } = await db.storage.from(match[1]).download(decodeURIComponent(match[2]))
  if (error || !data) return null
  return toBuffer(data)
}

// Algunas obras guardan la imagen como ruta del propio sitio ("assets-optimized/artworks/JBU-030.webp")
// en lugar de una URL completa. fetch() en el servidor no acepta rutas relativas: se resuelven contra el sitio.
export function resolveArtworkImageUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('//')) return `https:${raw}`
  return new URL(`/${raw.replace(/^(\.\/|\/)+/, '')}`, SITE_URL).toString()
}

export async function loadArtworkImage(rawUrl, options = {}) {
  const url = resolveArtworkImageUrl(rawUrl)
  if (!url) throw new HttpError(409, 'artwork_image_missing')
  const { db = null, fetchImpl = fetch } = typeof options === 'function' ? { fetchImpl: options } : options
  const reasons = []
  let bytes = null
  try { bytes = await downloadStorageObject(db, url) } catch (err) { reasons.push(`storage: ${err?.message || err}`) }
  if (!bytes) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const res = await fetchImpl(url, { signal: controller.signal })
      if (!res.ok) throw new Error(`estado HTTP ${res.status}`)
      bytes = Buffer.from(await res.arrayBuffer())
    } catch (err) { reasons.push(`descarga: ${err?.message || err}`) }
    finally { clearTimeout(timer) }
  }
  if (!bytes) throw new HttpError(409, 'artwork_image_unavailable', reasons.join(' | ') || 'sin detalle')
  try {
    const { default: sharp } = await import('sharp')
    return await sharp(bytes).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()
  } catch (err) {
    throw new HttpError(409, 'artwork_image_unavailable', `formato no soportado: ${err?.message || err}`)
  }
}

export async function qrPng(url) {
  const QRCode = (await import('qrcode')).default
  return QRCode.toBuffer(url, { errorCorrectionLevel: 'M', margin: 0, width: 360, color: { dark: '#161616', light: '#ffffff' } })
}

const fmtDate = (iso) => new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })

/** Render puro: mismos datos de entrada → documento. Sin precios ni datos comerciales. */
export async function renderCertificatePdf(certificate, { image, signature, qr }) {
  const { default: PDFDocument } = await import('pdfkit')
  const issued = new Date(certificate.issued_at)
  const doc = new PDFDocument({
    size: 'LETTER', layout: 'landscape', margin: 0,
    info: {
      Title: `Certificado de Autenticidad ${certificate.certificate_number}`, Author: certificate.artist || 'Estudio JBU',
      Subject: 'Certificate of Authenticity', Producer: 'Estudio JBU', Creator: 'Estudio JBU', CreationDate: issued, ModDate: issued,
    },
  })
  const chunks = []
  doc.on('data', (c) => chunks.push(c))
  const done = new Promise((resolve, reject) => { doc.on('end', resolve); doc.on('error', reject) })

  const W = 792, H = 612, M = 48
  const ink = '#161616', muted = '#6f6f6f', rule = '#c6c6c6'
  doc.rect(24, 24, W - 48, H - 48).lineWidth(0.75).strokeColor(ink).stroke()

  doc.fillColor(ink).font('Helvetica-Bold').fontSize(9).text('ESTUDIO JBU', M, M, { characterSpacing: 2 })
  doc.fillColor(muted).font('Helvetica').fontSize(7.5).text('CERTIFICADO DE AUTENTICIDAD · CERTIFICATE OF AUTHENTICITY', M, M + 14, { characterSpacing: 1 })
  doc.fillColor(muted).font('Courier').fontSize(8).text(certificate.certificate_number, W - M - 220, M, { width: 220, align: 'right' })
  if (Number(certificate.version) > 1) doc.text(`VERSIÓN ${certificate.version}`, W - M - 220, M + 12, { width: 220, align: 'right' })

  // Obra
  const imgX = M, imgY = 104, imgW = 300, imgH = 330
  doc.image(image, imgX, imgY, { fit: [imgW, imgH], align: 'center', valign: 'center' })

  // Ficha
  const x = 380, w = W - M - x
  doc.fillColor(ink).font('Times-Roman').fontSize(24).text(certificate.title || certificate.sku, x, 104, { width: w })
  let y = doc.y + 4
  doc.fillColor(muted).font('Helvetica').fontSize(10).text([certificate.artist, certificate.year].filter(Boolean).join(' · '), x, y, { width: w })
  y = doc.y + 16
  doc.moveTo(x, y).lineTo(x + w, y).lineWidth(0.5).strokeColor(rule).stroke()
  y += 12
  const rows = [
    ['ID DE OBRA', certificate.sku], ['ARTISTA', certificate.artist], ['AÑO', certificate.year],
    ['MEDIO', certificate.medium], ['TÉCNICA', certificate.technique], ['DIMENSIONES', certificate.dimensions],
    ['EDICIÓN', [certificate.edition, certificate.edition_type].filter(Boolean).join(' · ')],
    ['FECHA DE EMISIÓN', fmtDate(certificate.issued_at)],
    ['COLECCIÓN', certificate.owner_name_snapshot || 'Colección privada'],
  ].filter(([, v]) => v)
  for (const [label, value] of rows) {
    doc.fillColor(muted).font('Helvetica-Bold').fontSize(7).text(label, x, y, { width: 110, characterSpacing: 0.8 })
    doc.fillColor(ink).font('Helvetica').fontSize(9.5).text(String(value), x + 116, y - 1, { width: w - 116 })
    y = Math.max(doc.y, y + 12) + 6
  }
  doc.fillColor(muted).font('Helvetica').fontSize(8.5).text(
    'Se certifica que la obra descrita es una pieza original y auténtica registrada en el catálogo oficial de Estudio JBU. El artista conserva los derechos de propiedad intelectual y reproducción, salvo acuerdo por escrito.',
    x, y + 6, { width: w, lineGap: 2 })

  // Firma, QR y referencia técnica
  const baseY = 462
  doc.image(signature, x, baseY, { fit: [180, 60], valign: 'bottom' })
  doc.moveTo(x, baseY + 64).lineTo(x + 190, baseY + 64).lineWidth(0.5).strokeColor(ink).stroke()
  doc.fillColor(ink).font('Helvetica').fontSize(8.5).text(certificate.artist || 'Estudio JBU', x, baseY + 70, { width: 190 })
  doc.fillColor(muted).fontSize(7).text('Artista · Estudio JBU', x, baseY + 82, { width: 190 })

  const verifyUrl = certificateVerifyUrl(certificate.sku)
  doc.image(qr, W - M - 74, baseY, { width: 74 })
  doc.fillColor(muted).font('Helvetica').fontSize(7).text('Verificar', W - M - 210, baseY + 4, { width: 128, align: 'right' })
  doc.fillColor(ink).font('Courier').fontSize(6.5).text(verifyUrl.replace(/^https:\/\//, ''), W - M - 210, baseY + 16, { width: 128, align: 'right' })
  const hash = String(certificate.data_hash || '')
  doc.fillColor(muted).font('Courier').fontSize(6.5).text(`SHA-256 ${hash.slice(0, 8)}…${hash.slice(-4)} · ${certificate.canonical_version || 'jbu-coa-v1'}`, M, H - 44, { width: 400 })

  doc.end()
  await done
  return Buffer.concat(chunks)
}

/** Estado del PDF persistente para Admin: READY | METADATA_INCOMPLETE | MISSING. */
export function certificatePdfState(certificate) {
  if (!certificate) return 'MISSING'
  const hasPath = Boolean(certificate.pdf_storage_path)
  const hasHash = Boolean(certificate.pdf_hash)
  if (hasPath && hasHash) return 'READY'
  if (hasPath || hasHash) return 'METADATA_INCOMPLETE'
  return 'MISSING'
}

async function downloadStored(bucket, path) {
  const { data, error } = await bucket.download(path)
  if (error || !data) return null
  return toBuffer(data)
}

async function attachPdfMetadata(db, certificate, path, pdfHash) {
  const { data, error } = await db.rpc('attach_certificate_pdf', { _certificate_id: certificate.id, _path: path, _pdf_hash: pdfHash })
  if (error) throw new HttpError(503, 'pdf_attach_failed', error.message)
  if (data?.conflict) throw new HttpError(409, 'pdf_hash_conflict', 'el hash registrado no coincide con el archivo almacenado')
  return data?.certificate || { ...certificate, pdf_storage_path: path, pdf_hash: pdfHash }
}

/**
 * Localiza el PDF ya almacenado y completa la metadata faltante SIN regenerar ni reemitir.
 * No toca certificate_number, owner_id, data_hash ni version. Devuelve null si no existe archivo.
 */
export async function resolveStoredCertificatePdf(db, certificate) {
  if (!certificate?.id) throw new HttpError(404, 'certificate_not_found')
  if (certificate.pdf_hash && certificate.pdf_storage_path) return { path: certificate.pdf_storage_path, hash: certificate.pdf_hash, certificate }
  const bucket = db.storage.from(CERTIFICATE_BUCKET)
  const candidates = [...new Set([certificate.pdf_storage_path, certificatePdfPath(certificate)].filter(Boolean))]
  for (const path of candidates) {
    const bytes = await downloadStored(bucket, path)
    if (!bytes) continue
    const hash = sha256Hex(bytes)
    if (certificate.pdf_hash && certificate.pdf_hash !== hash) throw new HttpError(409, 'pdf_hash_conflict', 'el hash registrado no coincide con el archivo almacenado')
    // El archivo existe: la descarga no depende de que el registro se pueda completar.
    // Si la reparación de metadata falla (RPC, proveniencia), se informa y se sigue con el archivo real.
    try {
      const updated = await attachPdfMetadata(db, certificate, path, hash)
      return { path, hash, certificate: updated }
    } catch (err) {
      if (err?.code === 'pdf_hash_conflict' || err?.message === 'pdf_hash_conflict') throw err
      console.error('[certificates] pdf metadata attach failed; serving stored file', { certificate: certificate.id, reason: err?.message })
      return { path, hash, certificate: { ...certificate, pdf_storage_path: path, pdf_hash: hash }, metadataRepaired: false }
    }
  }
  return null
}

/**
 * Garantiza el PDF persistente del certificado. Idempotente: si ya existe, no se regenera.
 * Reparacion primero: un archivo ya presente en Storage se adopta completando solo la metadata;
 * solo se renderiza cuando no existe archivo alguno. Orden: bytes -> SHA-256 -> upload -> registro write-once.
 */
export async function ensureCertificatePdf({ db, certificate, render = renderCertificatePdf, loadImage = loadArtworkImage, loadSig = loadSignature, makeQr = qrPng }) {
  if (!certificate?.id) throw new HttpError(404, 'certificate_not_found')
  if (certificate.pdf_hash && certificate.pdf_storage_path) return certificate
  const stored = await resolveStoredCertificatePdf(db, certificate)
  if (stored) return stored.certificate
  const [image, signature, qr] = await Promise.all([
    loadImage(certificate.primary_image_url, { db }), loadSig(db), makeQr(certificateVerifyUrl(certificate.sku)),
  ])
  const path = certificatePdfPath(certificate)
  let bytes = await render(certificate, { image, signature, qr })
  const bucket = db.storage.from(CERTIFICATE_BUCKET)
  const { error: uploadError } = await bucket.upload(path, bytes, { contentType: 'application/pdf', upsert: false, cacheControl: '31536000' })
  if (uploadError) {
    // Otra peticion ya lo subio: el hash debe corresponder al archivo realmente almacenado.
    const winner = await downloadStored(bucket, path)
    if (!winner) throw new HttpError(503, 'pdf_storage_unavailable', uploadError.message)
    bytes = winner
  }
  return attachPdfMetadata(db, certificate, path, sha256Hex(bytes))
}

/** Comparación del archivo almacenado contra pdf_hash (bajo demanda, no en cada carga). */
export async function verifyStoredPdf(db, certificate) {
  if (!certificate?.pdf_storage_path || !certificate?.pdf_hash) return null
  const { data, error } = await db.storage.from(CERTIFICATE_BUCKET).download(certificate.pdf_storage_path)
  if (error || !data) return false
  return sha256Hex(await toBuffer(data)) === certificate.pdf_hash
}
