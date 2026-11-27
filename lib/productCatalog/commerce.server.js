import {frameProfileFromSku} from './customerPrintConfiguration.js'
import 'server-only'
import { checked } from './service.js'
import { fineArtCurrencies, fineArtLineType, marketVariant } from './commerce.js'
import { effectiveItemCountries } from '../shippingCountries.js'
import {printBorder,printBorderLabel} from '../printPresentation.js'

const attributeValues = rows => rows.map(row => ({
  code: row.attribute_code,
  value: row.text_value ?? row.number_value ?? row.boolean_value ?? row.enum_value,
}))
const size = attrs => attrs.find(row => row.code === 'size')?.value || ''

function verifiedGallery(row) {
  const primary = row.product_variant_assets.find(link=>link.is_primary)
  const configuration = JSON.stringify(primary?.configuration_snapshot)
  return row.product_variant_assets.filter(link => link.verified_at && JSON.stringify(link.configuration_snapshot) === configuration && link.art_assets?.visibility === 'public' &&
    link.art_assets.processing_status === 'ready' && ['mockup','lifestyle'].includes(link.art_assets.asset_type) && link.art_assets.public_url)
    .sort((a,b) => Number(b.is_primary) - Number(a.is_primary) || a.display_order - b.display_order)
    .map(link => ({ url:link.art_assets.public_url, altEs:link.alt_es, altEn:link.alt_en, primary:link.is_primary }))
}

export async function loadFineArtVariants(db, shipping, { artworkIds = null, variantIds = null, listing = false } = {}) {
  const lookup = listing ? 'public_listed_fine_art_variant_ids' : 'public_fine_art_variant_ids'
  const ids = []
  for (let offset = 0; ; offset += 200) {
    const page = await checked(db.rpc(lookup, { _artworks: artworkIds, _variants: variantIds }).range(offset,offset+199))
    ids.push(...(page || []))
    if (!page || page.length < 200) break
  }
  if (!ids?.length) return []
  const output = []
  for (let offset = 0; offset < ids.length; offset += 80) {
    const rows = await checked(db.from('product_variants').select(`
      id,sku,title,allowed_countries,replaces_print_id,artwork_print_id,
      source_print:artwork_prints!product_variants_artwork_print_id_fkey(id,artwork_id,border_unit,border_value),wall_art_mockups(width_mm,height_mm,border_mm,fit,scenes),
      products!inner(id,family_code,title_es,title_en,description_es,description_en,status,
        artwork_products!inner(is_primary,artworks!inner(id,sku,title,title_en,series,allowed_shipping_countries,shipping_policy_ids))),
      provider_product_mappings(id,provider_code,external_variant_id,external_configuration),
      product_variant_attribute_values(attribute_code,text_value,number_value,boolean_value,enum_value),
      product_variant_assets(is_primary,display_order,source,alt_es,alt_en,verified_at,configuration_snapshot,art_assets(visibility,processing_status,asset_type,public_url)),
      price_book_entries(id,product_variant_id,price_book_id,amount_minor,status,valid_from,valid_to,
        price_books(id,country,currency,channel,segment,priority,status,valid_from,valid_to))
    `).in('id', ids.slice(offset,offset + 80).map(row => row.id))
      .eq('status','active').eq('products.status','published')
      .eq('products.artwork_products.is_primary',true).eq('product_variant_assets.role','gallery'))
    const galleries = new Map(rows.map(row=>[row.id,verifiedGallery(row)]))
    const missing = rows.filter(row=>!galleries.get(row.id)[0]?.primary).map(row=>row.id)
    const studioMockups = new Map()
    if (missing.length) {
      // Consult the same artwork- and session-bound mockup policy used by the
      // publication check. Never infer public image eligibility from the join.
      const {data,error} = await db.rpc('fine_art_studio_default_mockups', { _variants:missing }).select('variant_id,source_url')
      if (!error) for (const mockup of data || []) studioMockups.set(mockup.variant_id,mockup.source_url)
      else if (!['PGRST202','42883'].includes(error.code)) console.error('[prints] Studio mockup lookup failed:', error.code)
    }
    for (const row of rows) {
      const product = row.products
      const art = product.artwork_products[0]?.artworks
      if (!art) continue
      const sourcePrint=row.source_print
      const presentationBorder=sourcePrint && sourcePrint.id===row.artwork_print_id && sourcePrint.artwork_id===art.id ? printBorder(sourcePrint) : null
      const attrs = attributeValues(row.product_variant_attribute_values).filter(attr=>!presentationBorder || attr.code!=='jbu_border')
      if(presentationBorder) attrs.push({code:'jbu_border',value:printBorderLabel(sourcePrint)})
      if (!size(attrs) && row.wall_art_mockups?.width_mm && row.wall_art_mockups.height_mm) {
        attrs.push({ code:'size',value:`${row.wall_art_mockups.width_mm} × ${row.wall_art_mockups.height_mm} mm` })
      }
      const countries = effectiveItemCountries({ allowed_shipping_countries:row.allowed_countries, artwork:art }, shipping.globalCountries)
      const gallery = galleries.get(row.id)
      const primary = row.product_variant_assets.find(link=>link.is_primary)
      const studioMockup = studioMockups.get(row.id)
      if (!gallery[0]?.primary && studioMockup) {
        gallery.unshift({ url:studioMockup, altEs:art.title, altEn:art.title_en || art.title, primary:true, illustration:true })
      }
      if (!gallery[0]?.primary || !countries.length) continue
      const now = Date.now()
      const current = row => (!row.valid_from || Date.parse(row.valid_from) <= now) && (!row.valid_to || Date.parse(row.valid_to) > now)
      const entries = row.price_book_entries.filter(e => e.status === 'active' && e.amount_minor <= 99999999 && current(e) && e.price_books?.status === 'active' &&
        current(e.price_books) && e.price_books.channel === 'storefront' && !e.price_books.segment && countries.includes(e.price_books.country) &&
        fineArtCurrencies.includes(e.price_books.currency))
      const frameProfile = frameProfileFromSku(row.sku) || (row.provider_product_mappings || [])
        .filter(mapping=>mapping.provider_code==='gelato')
        .map(mapping=>frameProfileFromSku(mapping.external_variant_id)).find(Boolean)
      const variant = {
        id:row.id, productId:product.id, productFamily:product.family_code, artworkId:art.id, artworkSku:art.sku, artworkTitle:art.title, artworkTitleEn:art.title_en,
        series:art.series, shippingPolicyIds:art.shipping_policy_ids || [], title:product.title_es, titleEn:product.title_en, description:product.description_es,
        descriptionEn:product.description_en, variantTitle:row.wall_art_mockups ? null : row.title, sku:row.sku,
        size:size(attrs), attributes:attrs, gallery, presentationBorder, frameProfile,
        previewGeometry:row.wall_art_mockups ? {widthMm:row.wall_art_mockups.width_mm,heightMm:row.wall_art_mockups.height_mm,borderMm:row.wall_art_mockups.border_mm, fit:row.wall_art_mockups.fit, scenes:row.wall_art_mockups.scenes} : null, countries, replacesPrintId:row.replaces_print_id,
        priceBooks:entries.map(e=>e.price_books), entries:entries.map(entry => ({ id:entry.id,product_variant_id:entry.product_variant_id,price_book_id:entry.price_book_id,
          amount_minor:entry.amount_minor,status:entry.status,valid_from:entry.valid_from,valid_to:entry.valid_to })),
        artworkShipping:art,
        supplierConfiguration:Array.isArray(primary?.configuration_snapshot?.providerMappings) ? primary.configuration_snapshot.providerMappings :
          studioMockup ? [...(row.provider_product_mappings || [])].sort((a,b)=>a.id.localeCompare(b.id)).map(mapping=>({
            provider:mapping.provider_code,variant:mapping.external_variant_id,configuration:mapping.external_configuration,
          })) : [],
      }
      if (countries.some(country => fineArtCurrencies.some(currency => marketVariant(variant,country,currency)))) output.push(variant)
    }
  }
  return output
}

/** Public projection excludes supplier, production and internal shipping-policy data. */
export function fineArtPublic(variant) {
  return Object.fromEntries(Object.entries(variant).filter(([key]) => !['artworkShipping','sku','supplierConfiguration'].includes(key)))
}

export function catalogCartProjection(variant, country, currency) {
  const price = marketVariant(variant,country,currency)
  if (!price) return null
  return {
    id:variant.artworkId, productId:variant.productId, variantId:variant.id, priceBookId:price.bookId, priceEntryId:price.entryId, type:fineArtLineType, quantity:1, title:variant.title, titleEn:variant.titleEn,
    image:variant.gallery[0].url, primary_image_url:variant.gallery[0].url, price:price.amountMinor / 100,
    amountMinor:price.amountMinor, currency, destination:country, allowed_shipping_countries:[country],
    effective_shipping_countries:[country],
  }
}
