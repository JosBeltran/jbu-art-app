// Tipo de cambio único MXN → USD para mostrar y cobrar. Una sola fuente:
// Frankfurter cacheado 12 h en el servidor; respaldo USD_PER_MXN; sin tasa → null.
export const FX_REVALIDATE_SECONDS = 43200

export async function getUsdPerMxn() {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=MXN&to=USD', { next: { revalidate: FX_REVALIDATE_SECONDS } })
    if (res.ok) {
      const rate = Number((await res.json())?.rates?.USD)
      if (Number.isFinite(rate) && rate > 0) return { usdPerMxn: rate, source: 'frankfurter' }
    }
  } catch {
    // respaldo abajo
  }
  const env = Number(process.env.USD_PER_MXN)
  if (Number.isFinite(env) && env > 0) return { usdPerMxn: env, source: 'env' }
  return { usdPerMxn: null, source: null }
}
