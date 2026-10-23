// Reglas compartidas (cliente y servidor) del certificado: estado, privacidad y URL permanente.
import { SITE_URL } from '../share.js'

export const certificateVerifyUrl = (sku) => `${SITE_URL}/verify/${encodeURIComponent(String(sku || '').trim())}`

export const CLAIM_STATES = ['NOT_CLAIMED', 'CLAIM_PENDING', 'VERIFIED', 'MANUALLY_ASSIGNED']

/** Estado de reclamación/propiedad para Admin, derivado del certificado vigente primero. */
export function certificateClaimState({ artwork, certificate }) {
  if (certificate && certificate.status === 'ISSUED') return certificate.claim_source === 'ADMIN_MANUAL' ? 'MANUALLY_ASSIGNED' : 'VERIFIED'
  if (String(artwork?.ownership_status || '').toUpperCase() === 'CLAIM_PENDING' || artwork?.pending_owner_id) return 'CLAIM_PENDING'
  return 'NOT_CLAIMED'
}

/** Estado por obra dentro de un lote: una obra verificada o pendiente no se puede volver a reclamar. */
export function batchItemState({ artwork, certificate, item }) {
  if (certificate?.status === 'ISSUED' || String(artwork?.ownership_status || '').toUpperCase() === 'VERIFIED') return 'VERIFIED'
  if (String(artwork?.ownership_status || '').toUpperCase() === 'CLAIM_PENDING' || artwork?.pending_owner_id || item?.is_claimed) return 'CLAIM_PENDING'
  return 'AVAILABLE'
}

const PUBLIC_CERTIFICATE_FIELDS = ['certificate_number', 'sku', 'title', 'artist', 'year', 'medium', 'technique', 'dimensions',
  'edition', 'edition_type', 'primary_image_url', 'issued_at', 'version', 'status', 'data_hash', 'pdf_hash', 'canonical_version']

/** Proyección pública: sin correo, nombre del colector, IDs internos, órdenes ni tokens. */
export function publicCertificate(certificate) {
  if (!certificate) return null
  const out = {}
  for (const k of PUBLIC_CERTIFICATE_FIELDS) if (certificate[k] !== null && certificate[k] !== undefined) out[k] = certificate[k]
  out.registered_collection = Boolean(certificate.owner_id || certificate.owner_name_snapshot)
  out.has_pdf = Boolean(certificate.pdf_storage_path || certificate.pdf_hash)
  return out
}
