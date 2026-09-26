// Ruta única de la imagen de respaldo para obras sin fotografía.
// El archivo existe en public/images/artwork-placeholder.jpg (HTTP 200 garantizado).
export const ARTWORK_PLACEHOLDER = '/images/artwork-placeholder.jpg'

// Manejador seguro de error de imagen: se desactiva a sí mismo ANTES de
// asignar el respaldo, de modo que un fallo del respaldo nunca pueda
// disparar otra petición (evita bucles recursivos de error).
export function handleArtworkImageError(event) {
  const img = event?.currentTarget || event?.target
  if (!img) return
  img.onerror = null
  if (img.src.endsWith(ARTWORK_PLACEHOLDER)) return
  img.src = ARTWORK_PLACEHOLDER
}
