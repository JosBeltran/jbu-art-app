import { isUnrelatedProduct, wallArtFamilies, wallArtGroup } from './wallArt.js'

export const studioCapabilities = {
  gelato: { groupFromVariants:true, destinationPricing:true, commercialImages:false, shippingAddressQuote:true },
  prodigi: { groupFromVariants:false, destinationPricing:false, commercialImages:false, shippingAddressQuote:true },
}

const dimension = /^\d+(?:[.,]\d+)?x\d+(?:[.,]\d+)?(?:-?mm|-?cm|-?inch|-?in)$/i
const labels = {
  Size:'size', PaperFormat:'size', FrameSize:'size', Orientation:'orientation', PaperType:'paper',
  framecolour:'frame_color', framecolor:'frame_color', framematerial:'frame_material', glaze:'glazing',
  FrameColor:'frame_color', FrameColour:'frame_color', FrameMaterial:'frame_material', Finish:'finish',
  SurfaceFinish:'finish', CoatingType:'finish', Glaze:'glazing', Glazing:'glazing', Mat:'mount',
  Mount:'mount', Material:'material', CanvasType:'material',
}
const gelatoFields = {
  pf:'size', frs:'size', frc:'frame_color', frm:'frame_material', pt:'paper', ori:'orientation',
  ct:'finish', gl:'glazing', mt:'mount',
}
const prettify = value => String(value).replace(/[-_]+/g,' ').trim()
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

export function describeStudioVariant(raw) {
  const attributes = {}
  for (const [code,value] of Object.entries(record(raw.attributes))) {
    if (!['string','number','boolean'].includes(typeof value)) continue
    const key = labels[code] ?? code.replace(/([a-z])([A-Z])/g,'$1_$2').replace(/[^a-z0-9]+/gi,'_').toLowerCase()
    if (key && !['product_status','variable','color_type'].includes(key)) attributes[key] = String(value)
  }
  if (!attributes.size && raw.size) attributes.size = raw.size
  if (!attributes.size && raw.widthMm > 0 && raw.heightMm > 0) attributes.size = `${raw.widthMm} × ${raw.heightMm} mm`
  return attributes
}

/** Only remove known selectors inside recognized families. Preserve every unknown token in the key. */
export function gelatoSeries(uid) {
  const tokens = uid.toLowerCase().split('_')
  const dimensionsIndex = tokens.findIndex(token => dimension.test(token))
  if (dimensionsIndex < 0) return { series:uid, attributes:{} }
  const attributes = {}
  const keep = []
  for (let index=0;index<tokens.length;index++) {
    const token = tokens[index]
    const field = gelatoFields[token]
    const value = tokens[index+1]
    if (field && value && !gelatoFields[value] && (field !== 'size' || dimension.test(value))) {
      attributes[field] = value
      index++
    } else if (index === tokens.length-1 && ['hor','ver','portrait','landscape'].includes(token)) {
      attributes.orientation ??= token
    } else if (index === dimensionsIndex) {
      attributes.size ??= token
    } else {
      keep.push(token)
    }
  }
  return { series:keep.join('_') || uid, attributes }
}

export function studioGroup(provider, product) {
  if (isUnrelatedProduct(product.externalId || '')) return null
  const group = provider === 'gelato'
    ? wallArtGroup({externalId:product.externalId}) || wallArtGroup({title:product.title})
    : wallArtGroup(product)
  if (!group) return null
  const config = studioCapabilities[provider]
  const first = product.variants?.[0]
  const parsed = config.groupFromVariants ? gelatoSeries(product.externalId) : { series:product.externalId, attributes:{} }
  const name = typeof product.title === 'string' && product.title !== product.externalId &&
    !/^[a-z0-9]+(?:_[a-z0-9-]+){3,}$/i.test(product.title) ? product.title : null
  return {
    id:provider + ':' + group + ':' + parsed.series, group, provider, externalId:product.externalId,
    catalogId:product.category || null, name, categoryLabel:wallArtFamilies[group],
    description:product.description || null,
    variants:config.groupFromVariants && first ? [{
      ...first, attributes:{...parsed.attributes,...describeStudioVariant(first)},
      externalId:product.externalId, catalogId:product.category || null,
      countries:Array.isArray(product.supportedCountries) ? product.supportedCountries.filter(code=>typeof code==='string' && /^[A-Z]{2}$/.test(code)) : [],
    }] : [],
  }
}

export function mergeStudioGroups(current, next) {
  const groups = new Map(current.map(group => [group.id,group]))
  for (const group of next) {
    const previous = groups.get(group.id)
    if (!previous) { groups.set(group.id,group); continue }
    const variants = new Map(previous.variants.map(variant => [variant.externalVariantId,variant]))
    for (const variant of group.variants) variants.set(variant.externalVariantId,variant)
    groups.set(group.id,{ ...previous, variants:[...variants.values()] })
  }
  return [...groups.values()]
}

export function matchingStudioVariants(variants, selection) {
  return variants.filter(variant => Object.entries(selection).every(([key,value]) => !value || variant.attributes[key] === value))
}

export function studioValue(value) {
  if (value === 'hor' || value === 'landscape') return ['Horizontal','Landscape']
  if (value === 'ver' || value === 'portrait') return ['Vertical','Portrait']
  const translations = { black:'Negro', white:'Blanco', natural:'Natural', wood:'Madera', aluminium:'Aluminio', aluminum:'Aluminio', matte:'Mate' }
  const display = prettify(value).replace(/(\d)x(?=\d)/g,'$1 × ')
  return [translations[value] || display,display]
}

export function studioCountryAllowed(variant,country) {
  const supported = Array.isArray(variant.countries) ? variant.countries.filter(code=>typeof code==='string' && /^[A-Z]{2}$/.test(code)) : []
  return !country || !supported.length || supported.includes(country)
}

export function studioMatches(group, query) {
  const haystack = [group.name, ...group.categoryLabel, group.description,
    ...group.variants.flatMap(item=>Object.values(item.attributes).flatMap(studioValue))].filter(Boolean).join(' ')
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  return normalize(query).trim().split(/\s+/).every(word=>normalize(haystack).includes(word))
}

export function studioVariantKey(variant) {
  return variant.externalVariantId + ':' + JSON.stringify(Object.entries(variant.configuration || {}).sort())
}
