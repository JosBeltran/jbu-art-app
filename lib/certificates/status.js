// Regla única de "certificado verificado". Nunca considerar null como verificado.
// Transición: certificate_number puede faltar en certificados legacy (columna nueva), por eso
// se exige estado VERIFIED + hash + fecha de emisión.
export function isCertificateVerified(artwork) {
  return Boolean(
    artwork &&
    String(artwork.ownership_status || '').toUpperCase() === 'VERIFIED' &&
    artwork.certificate_hash &&
    artwork.certificate_issued_at
  )
}
