import { createHash } from 'node:crypto'
import { describeStudioVariant, gelatoSeries, studioDimensions, studioGroup, studioValue } from './studioDiscovery.js'
import { wallArtFamilies, wallArtGroup } from './wallArt.js'

const constructionKeys = ['paper','material','frame_material','stretcher_thickness','substrate','paper_weight','frame_profile','construction']
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value==='object'
  ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])) : value
export const fingerprint = value => createHash('sha256').update(JSON.stringify(stable(value ?? null))).digest('hex')

/** Structured construction identity wins. Unknown UID tokens are retained by the fallback parser. */
export function normalizeSupplierEntries(provider, product) {
  const base = studioGroup(provider,product)
  if (!base) return []
  if(product.rawMetadata?.isPrintable===false)return []
  const { variants = [], ...source } = product
  const parentAttributes=Object.fromEntries(Object.entries(product.attributes || {}).flatMap(([key,value])=>
    typeof value==='string' ? [[key,value]] : Array.isArray(value) && value.length===1 && typeof value[0]==='string' ? [[key,value[0]]] : []))
  return variants.map(raw => {
    const parsed = provider==='gelato' ? gelatoSeries(product.externalId) : {attributes:{}}
    const attributes = {...parsed.attributes,...describeStudioVariant({attributes:parentAttributes}),...describeStudioVariant(raw)}
    const family=wallArtGroup({title:product.rawMetadata?.productType || attributes.product_type,category:product.rawMetadata?.productCategory}) || base.group
    const construction = Object.fromEntries(constructionKeys.filter(key=>attributes[key]).map(key=>[key,attributes[key].toLowerCase()]))
    // A supplied commercial parent ID identifies a product; category alone never does.
    const commercialId = product.rawMetadata?.commercialProductId || product.rawMetadata?.productGroupId
    const identity = commercialId ? [provider,family,commercialId,construction] : [base.id,family,construction]
    const groupKey = provider+':'+family+':'+fingerprint(identity).slice(0,32)
    const details = constructionKeys.flatMap(key=>attributes[key] ? [studioValue(attributes[key])] : [])
    const titles = wallArtFamilies[family].map((label,index)=>[label,...details.map(value=>value[index])].join(' · '))
    const specifications = Object.fromEntries(['paper','material','frame_material','finish','mount','glazing','stretcher_thickness']
      .filter(key=>attributes[key]).map(key=>[key,attributes[key]]))
    const dimensions=provider==='gelato' ? studioDimensions(raw,attributes.size) : {widthMm:raw.widthMm || null,heightMm:raw.heightMm || null,
      sizeCode:/^a\d{1,2}$/i.test(attributes.size || '') ? attributes.size.toUpperCase() : null}
    const variant = {...raw,...dimensions,dimensionsSource:raw.widthMm && raw.heightMm ? 'provider_dimensions' : provider==='gelato' && dimensions.widthMm ? 'uid_size_fallback' : 'unreported',attributes,externalId:product.externalId,
      countries:provider==='gelato' ? base.variants.find(row=>row.externalVariantId===raw.externalVariantId)?.countries || [] : raw.countries || []}
    const specLabels={paper:['Papel','Paper'],material:['Material','Material'],frame_material:['Marco','Frame'],
      stretcher_thickness:['Grosor del bastidor','Stretcher thickness'],substrate:['Sustrato','Substrate'],paper_weight:['Gramaje','Paper weight'],
      frame_profile:['Perfil del marco','Frame profile'],construction:['Construcción','Construction']}
    const descriptions=[0,1].map(index=>Object.entries(construction).map(([key,value])=>`${specLabels[key][index]}: ${studioValue(value)[index]}`).join(' · '))
    const metadata = {titles, descriptions, sourceDescription:product.description || null, specifications,
      supplierName:base.name, sourceCatalog:product.category || null, identitySource:commercialId ? 'structured_parent' : 'conservative_provider_identity',
      construction, images:product.imageReferences || [], image:null,
      // Image permissions require a separately verified licence. No assumed supplier rendering endpoint.
      availability:variant.countries.length ? 'supplier_reported' : 'unverified'}
    return {externalId:product.externalId,externalVariantId:raw.externalVariantId,groupKey,family,
      product:source,variant,metadata,fingerprint:fingerprint({product:source,variant,metadata})}
  })
}

export function nextSupplierOffset(page, offset, count) {
  const explicit = Object.hasOwn(page,'nextOffset')
  const next = explicit ? page.nextOffset : page.total != null ? (offset+count<page.total ? offset+count : null)
    : count===25 ? offset+count : null
  if ((page.total != null && (!Number.isInteger(page.total) || page.total<0 || (!count && offset<page.total) || (next==null && offset+count<page.total))) ||
      (next!=null && (!Number.isSafeInteger(next) || next<=offset || count===0))) {
    throw Object.assign(new Error('supplier_pagination_invalid'),{code:'supplier_pagination_invalid'})
  }
  return next
}

export function retryDelay(error, attempt, now=Date.now()) {
  const seconds = Number(error.retryAfter)
  const date = Date.parse(error.retryAfter)
  const requested = Number.isFinite(seconds) && seconds>0 ? seconds : Number.isFinite(date) ? Math.ceil((date-now)/1000) : 0
  return Math.min(86400,Math.max(5 * 2**Math.min(attempt,10),requested))
}
