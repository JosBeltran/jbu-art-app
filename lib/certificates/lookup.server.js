// Lecturas de certificados por SKU (servidor). Fuente principal: tabla certificates.
export async function activeCertificateBySku(db, sku) {
  const clean = String(sku || '').trim()
  if (!clean) return { certificate: null, error: null }
  const { data, error } = await db.from('certificates').select('*').ilike('sku', clean).eq('status', 'ISSUED')
    .order('version', { ascending: false }).limit(1)
  return { certificate: Array.isArray(data) ? data[0] || null : null, error }
}
