/**
 * artworks.dimensions (texto) sigue siendo la fuente de verdad. Solo se leen
 * sus números en cm para calcular pulgadas; si no se puede con seguridad, nada.
 */

const CM_PER_IN = 2.54

export function parseCmDimensions(text) {
  const raw = String(text ?? '').trim()
  if (!raw || !/cm\b/i.test(raw) || /\b(in|inch|inches|pulg)\b|"/i.test(raw)) return null
  const parts = raw.replace(/cm/gi, ' ').split(/\s*[x×X*]\s*/).map((p) => p.trim().replace(',', '.'))
  if (parts.length < 2 || parts.length > 3) return null
  const values = parts.map(Number)
  if (values.some((v) => !Number.isFinite(v) || v <= 0)) return null
  return values
}

const fmtIn = (cm) => {
  const v = Math.round((cm / CM_PER_IN) * 10) / 10
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

/** «85 × 55 cm» → «33.5 × 21.7 in». */
export function inchesFromCmText(text) {
  const values = parseCmDimensions(text)
  return values ? `${values.map(fmtIn).join(' × ')} in` : null
}
