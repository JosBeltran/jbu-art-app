import { SITE_URL } from '../seo.js'
import { PRINT_ASSET_SIZES } from '../printAssetPresets.js'

const standardMm = { A0: [841, 1189], A1: PRINT_ASSET_SIZES.A1.mm, A2: PRINT_ASSET_SIZES.A2.mm, A3: [297, 420] }
export const printShareLanguage = locale => String(locale).toLowerCase().startsWith('en') ? 'en' : 'es'
const clean = (value, length) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, length) : ''

export function isShareablePrint(variant) {
  return variant?.is_active === true && Number.isFinite(Number(variant.price)) && Number(variant.price) > 0 &&
    ['OPEN', 'LIMITED', 'LIMITADA'].includes(String(variant.edition_type || 'OPEN').toUpperCase())
}

export function printShareUrl(id, language = 'es') {
  return SITE_URL + '/prints/' + encodeURIComponent(id) + (printShareLanguage(language) === 'en' ? '?lang=en' : '')
}

export function printSocialImageUrl(id, language, revision) {
  const query = new URLSearchParams({ lang: printShareLanguage(language) })
  if (revision) query.set('v', revision)
  return SITE_URL + '/social/print/' + encodeURIComponent(id) + '?' + query
}

function explicitDimensions(size) {
  const pair = size.match(/(\d+(?:[.,]\d+)?)\s*(mm|cm|in(?:ches)?|pulg(?:adas)?\.?|["″])?\s*[×xX]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|in(?:ches)?|pulg(?:adas)?\.?|["″])(?=$|\s|[)·,;])/i)
  if (!pair) return null
  const toMm = (value, unit) => Number(value.replace(',', '.')) * ({ mm: 1, cm: 10 }[unit.toLowerCase()] || 25.4)
  const dimensions = [toMm(pair[1], pair[2] || pair[4]), toMm(pair[3], pair[4])]
  return dimensions.every(value => Number.isFinite(value) && value > 0) ? dimensions : null
}

export function printSharePresentation(artwork, variant, locale) {
  const language = printShareLanguage(locale)
  const en = language === 'en'
  const artworkTitle = clean((en && artwork.title_en) || artwork.title || artwork.sku, 160) || (en ? 'Artwork' : 'Obra')
  const size = clean(variant.size, 120)
  const format = size.match(/\bA[0-3]\b/i)?.[0].toUpperCase() || ''
  const dimensions = explicitDimensions(size) || standardMm[format]
  const formatPair = (unit, divisor, digits) => {
    const number = new Intl.NumberFormat(en ? 'en-US' : 'es-MX', { maximumFractionDigits: digits })
    return dimensions.map(value => number.format(value / divisor)).join(' × ') + ' ' + unit
  }
  const centimeters = dimensions ? formatPair('cm', 10, 2) : ''
  const inches = dimensions ? formatPair(en ? 'in' : 'pulg', 25.4, 2) : ''
  const sizeLabel = format || (dimensions ? '' : size)
  const paper = clean(variant.paper_type, 110)
  const framing = clean(variant.framing, 85)
  const finish = clean(variant.finish, 80)
  const giclee = /\bgicl[eé]e\b/i.test(paper + ' ' + finish)
  const kind = en ? (giclee ? 'Fine Art Giclée' : 'Fine Art Print') : (giclee ? 'Impresión Fine Art Giclée' : 'Impresión Fine Art')
  const limited = ['LIMITED', 'LIMITADA'].includes(String(variant.edition_type).toUpperCase())
  const edition = limited ? (en ? 'Limited Edition' : 'Edición limitada') : (en ? 'Open Edition' : 'Edición abierta')
  const titleSize = sizeLabel || centimeters
  const title = artworkTitle + ' | ' + (en ? [titleSize, kind] : [kind, titleSize]).filter(Boolean).join(' ')
  const dimensionsLabel = centimeters ? centimeters + ' (' + inches + ')' : size
  const description = [dimensionsLabel, kind, edition, paper, framing, 'JBU Art'].filter(Boolean).join(' · ')
  return { language, artworkTitle, title, kind, sizeLabel, centimeters, inches, dimensionsLabel, edition, paper, framing, description }
}

export function printSocialMetadata(presentation, variantId, revision) {
  const { language, title, description } = presentation
  const canonical = printShareUrl(variantId)
  const url = printShareUrl(variantId, language)
  const image = printSocialImageUrl(variantId, language, revision)
  return {
    title: { absolute: title },
    description,
    alternates: { canonical, languages: { es: canonical, en: printShareUrl(variantId, 'en') } },
    openGraph: {
      type: 'website', title, description, url, siteName: 'JBU Art', locale: language === 'en' ? 'en_US' : 'es_MX',
      images: [{ url: image, width: 1200, height: 630, alt: title, type: 'image/jpeg' }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [{ url: image, alt: title }] },
  }
}
