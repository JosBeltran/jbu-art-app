// Serialización canónica del certificado (jbu-coa-v1). Solo servidor.
// El orden de CANONICAL_FIELDS es parte del formato: no reordenar sin crear una versión nueva.
import { createHash } from 'node:crypto'

export const CANONICAL_VERSION = 'jbu-coa-v1'
export const HASH_ALGORITHM = 'SHA-256'
export const SNAPSHOT_FIELDS = ['sku', 'title', 'artist', 'year', 'medium', 'technique', 'dimensions', 'edition', 'edition_type', 'primary_image_url']
export const CANONICAL_FIELDS = ['canonical_version', 'certificate_number', 'artwork_id', 'sku', 'title', 'artist', 'year', 'medium', 'technique', 'dimensions', 'edition', 'edition_type', 'owner_id', 'issued_at']

/** null, undefined y cadenas vacías → null; texto recortado; números → texto. */
export function normalizeValue(value) {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  const text = String(value).trim()
  return text === '' ? null : text
}

export function normalizeIssuedAt(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('invalid_issued_at')
  return date.toISOString()
}

/** Copia de los campos de la obra que congela el certificado. */
export function buildSnapshot(artwork) {
  const snapshot = {}
  for (const field of SNAPSHOT_FIELDS) {
    snapshot[field] = normalizeValue(field === 'primary_image_url' ? artwork?.primary_image_url ?? artwork?.image_url : artwork?.[field])
  }
  return snapshot
}

/** Cadena JSON con orden fijo, construida campo por campo. */
export function canonicalCertificateString({ certificateNumber, artworkId, ownerId, issuedAt, snapshot }) {
  const source = {
    canonical_version: CANONICAL_VERSION,
    certificate_number: certificateNumber,
    artwork_id: artworkId,
    ...snapshot,
    owner_id: ownerId,
    issued_at: normalizeIssuedAt(issuedAt),
  }
  const ordered = {}
  for (const field of CANONICAL_FIELDS) ordered[field] = normalizeValue(source[field])
  return JSON.stringify(ordered)
}

export function certificateDataHash(input) {
  return createHash('sha256').update(canonicalCertificateString(input), 'utf8').digest('hex')
}

/** Número legible estable: el existente, o COA-{SKU} (el mismo que ya muestra la UI). */
export function certificateNumberFor(artwork, version = 1) {
  const existing = normalizeValue(artwork?.certificate_number)
  if (existing && version === 1) return existing
  const base = `COA-${String(artwork?.sku || '').trim().toUpperCase()}`
  return version > 1 ? `${base}-V${version}` : base
}
