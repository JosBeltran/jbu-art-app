export function artworkPrintHref(sku, { variant, country, lang } = {}) {
  const query = new URLSearchParams()
  if (variant) query.set('variant', variant)
  if (country) query.set('country', country)
  if (lang) query.set('lang', lang)
  return '/prints/' + encodeURIComponent(sku) + (query.size ? '?' + query : '')
}
