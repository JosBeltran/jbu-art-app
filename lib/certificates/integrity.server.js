// Integridad de datos: recalcula data_hash desde el snapshot guardado (no desde la obra actual).
import { certificateDataHash, SNAPSHOT_FIELDS } from './canonicalize.js'

export function verifyCertificateData(certificate) {
  if (!certificate?.data_hash || !certificate?.issued_at) return false
  if (certificate.canonical_version && certificate.canonical_version !== 'jbu-coa-v1') return false
  const snapshot = {}
  for (const field of SNAPSHOT_FIELDS) snapshot[field] = certificate[field] ?? null
  try {
    return certificateDataHash({
      certificateNumber: certificate.certificate_number, artworkId: certificate.artwork_id,
      ownerId: certificate.owner_id ?? null, issuedAt: certificate.issued_at, snapshot,
    }) === certificate.data_hash
  } catch { return false }
}
