// Regla única de "certificado verificado": depende de un certificado vigente en la tabla certificates.
// Nunca considerar verificado: ownership_status null, un hash legacy aislado o una obra sin certificado.
export function isCertificateVerified(certificate, { dataIntegrity = true } = {}) {
  return Boolean(
    certificate &&
    certificate.status === 'ISSUED' &&
    /^[0-9a-f]{64}$/.test(String(certificate.data_hash || '')) &&
    certificate.issued_at &&
    dataIntegrity === true
  )
}
