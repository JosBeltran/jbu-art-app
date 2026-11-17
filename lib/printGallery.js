export const PRINT_GALLERY_LIMIT = 20
export const PRINT_GALLERY_UPLOAD_LIMIT = 4 * 1024 * 1024
export const LEGACY_PRINT_PREVIEW = { url: null, alt_es: '', alt_en: '' }

export function printGalleryPrefix(id) {
  return `artwork-images/print-galleries/${id}/`
}

/**
 * @param {{url: string | null, alt_es: string, alt_en: string}[] | undefined} entries
 * @param {string | null} fallback
 * @param {string} lang
 */
export function printGalleryImages(entries, fallback, lang) {
  const images = (entries?.length ? entries : [LEGACY_PRINT_PREVIEW]).flatMap(entry => {
    const url = entry.url || fallback
    return url ? [{ url, alt: (lang === 'en' ? entry.alt_en : entry.alt_es) || '' }] : []
  })
  return images
}
