// Tipo de cambio único MXN → USD, solo para mostrar precios. Cacheado en el
// servidor (sin llamada externa por render); respaldo USD_PER_MXN; sin tasa la UI muestra MXN.
export const revalidate = 43200

export async function GET() {
  let usdPerMxn = null
  let source = null
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=MXN&to=USD', { next: { revalidate: 43200 } })
    if (res.ok) {
      const rate = Number((await res.json())?.rates?.USD)
      if (Number.isFinite(rate) && rate > 0) { usdPerMxn = rate; source = 'frankfurter' }
    }
  } catch {
    // respaldo abajo
  }
  if (usdPerMxn === null) {
    const env = Number(process.env.USD_PER_MXN)
    if (Number.isFinite(env) && env > 0) { usdPerMxn = env; source = 'env' }
  }
  return Response.json({ base: 'MXN', usdPerMxn, source }, { headers: { 'Cache-Control': 'public, s-maxage=43200, stale-while-revalidate=86400' } })
}
