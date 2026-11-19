import { HttpError } from '../certificates/adminAuth.server.js'
import { analyzeCompatibility, proposePrice, resolvePrice } from './pricing.js'
import { fulfillmentService } from './fulfillment.js'
import { providerAdapter } from './providers.js'
import { wallArtGroup, wallArtProductFamily } from './wallArt.js'

export async function checked(query, missing = null) {
  const { data, error } = await query
  if (error) throw error
  if (missing && data == null) throw new HttpError(404, missing)
  return data
}

async function draftProduct(db, id) {
  const product = await checked(db.from('products').select('id,status,legacy_source,family_code').eq('id', id).maybeSingle(), 'product_missing')
  if (product.status !== 'draft' || product.legacy_source) throw new HttpError(409, 'product_reference_only')
  return product
}

async function candidateDetails(db, id) {
  return checked(db.from('product_discovery_candidates')
    .select('*,provider_catalog_variants(external_sku,specification)').eq('id', id).maybeSingle(), 'candidate_missing')
}

async function writableVariant(db, id) {
  const variant = await checked(db.from('product_variants').select('id,product_id').eq('id', id).maybeSingle(), 'variant_missing')
  const product = await draftProduct(db, variant.product_id)
  return { variant, product }
}

function compatibleOptions(variant, attributes) {
  const selected = Object.entries(attributes || {})
  const options = variant.options || {}
  if (!selected.every(([key, value]) => Array.isArray(options[key]) && options[key].includes(value))) return false
  if (selected.length === 0) return true
  return Array.isArray(variant.combinations) && variant.combinations.some(row =>
    Object.keys(row.attributes || {}).length === selected.length &&
    selected.every(([key, value]) => row.attributes?.[key] === value))
}

export function catalogService(db, actor, provider = providerAdapter) {
  const audit = async (operation, subject_id) =>
    checked(db.from('product_catalog_audit').insert({ actor_id: actor, operation, subject_id }))
  async function wallArtCandidates(sessionId, ids) {
    const session = await checked(db.from('product_discovery_sessions').select('created_by,artwork_id,criteria,state')
      .eq('id', sessionId).maybeSingle(), 'session_missing')
    if (session.created_by !== actor || !session.artwork_id || session.criteria.workflow !== 'wall_art' || session.state === 'archived') {
      throw new HttpError(409, 'wall_art_session_invalid')
    }
    const candidates = await checked(db.from('product_discovery_candidates')
      .select('id,external_id,external_variant_id,provider_catalog_variants(specification)')
      .eq('session_id', sessionId).eq('provider_code','gelato').in('id', ids))
    if (candidates.length !== ids.length) throw new HttpError(409, 'wall_art_candidate_invalid')
    return candidates
  }
  const api = {
    ...fulfillmentService(db, actor, provider),
    async list({ offset = 0 }) {
      const [products, families, books] = await Promise.all([
        checked(db.from('products').select('id,sku,title_es,title_en,status,legacy_source,family_code')
          .order('created_at', { ascending: false }).order('id').range(offset, offset + 24)),
        checked(db.from('product_families').select('*').order('code')),
        checked(db.from('price_books').select('id,code,country,currency,status,name').order('code')),
      ])
      return { products, families, books, nextOffset: products.length === 25 ? offset + 25 : null }
    },
    async artworkSearch({ query }) {
      const term = query.replace(/[%_\\]/g, '')
      return checked(db.from('artworks').select('id,title,title_en,sku,primary_image_url,dimensions')
        .ilike('title', '%' + term + '%').order('title').limit(25))
    },
    async artworkAssets({ artworkId }) {
      const [artwork, assets, revisions] = await Promise.all([
        checked(db.from('artworks').select('id,title,title_en,sku,primary_image_url,dimensions').eq('id', artworkId).maybeSingle(), 'artwork_missing'),
        checked(db.from('art_assets').select('id,asset_type,width_px,height_px,dpi').eq('artwork_id', artworkId).limit(50)),
        checked(db.from('print_asset_generations').select('revision_id,size,effective_dpi,production_status')
          .eq('artwork_id', artworkId).eq('is_current', true).eq('production_status','MASTER_READY').limit(25)),
      ])
      return { artwork, assets, revisions }
    },
    async registerProductionAsset({ revisionId }) {
      const revision = await checked(db.from('print_asset_generations').select('artwork_id,production_file_path,layout,effective_dpi')
        .eq('revision_id', revisionId).eq('production_status','MASTER_READY').maybeSingle(), 'production_master_missing')
      const layout = revision.layout || {}
      const row = await checked(db.from('art_assets').upsert({
        artwork_id: revision.artwork_id, storage_bucket: 'print-masters', storage_path: revision.production_file_path,
        asset_type: 'production_derivative', visibility: 'private', dpi: revision.effective_dpi,
        width_px: layout.width || null, height_px: layout.height || null,
      }, { onConflict: 'storage_bucket,storage_path,version' }).select('id,asset_type,width_px,height_px,dpi').single())
      await audit('register_production_asset', row.id)
      return row
    },
    async productDetails({ productId }) {
      const [product, variants, artworks, family, media] = await Promise.all([
        checked(db.from('products').select('*').eq('id', productId).maybeSingle(), 'product_missing'),
        checked(db.from('product_variants').select('*,product_variant_attribute_values(*),provider_product_mappings(*),price_book_entries(*),wall_art_mockups(*)').eq('product_id', productId).order('sku')),
        checked(db.from('artwork_products').select('relationship_type,artworks(id,sku,title,primary_image_url)').eq('product_id', productId)),
        checked(db.from('product_attributes').select('*,product_attribute_values(*),product_family_attributes(family_code)').order('code')),
        checked(db.from('product_media').select('asset_id,art_assets(public_url)').eq('product_id',productId)),
      ])
      return { product, variants, artworks, media, attributes: family.filter(attr => attr.product_family_attributes.some(row => row.family_code === product.family_code)) }
    },
    categories: input => provider(input.provider).categories(input),
    searchCatalog: input => provider(input.provider).search(input),
    inspectProduct: input => provider(input.provider).product(input.externalId, input),
    async wallArtCatalogs() {
      const catalogs = await provider('gelato').categories()
      return catalogs.filter(row => wallArtGroup({ externalId: row.id, title: row.title }))
    },
    async wallArtSearch({ catalogId, ...options }) {
      const result = await provider('gelato').search({ category: catalogId, ...options })
      return { ...result, items: result.items.flatMap(item => {
        const group = wallArtGroup(item)
        return group ? [{ ...item, group }] : []
      }) }
    },
    async wallArtCosts({ sessionId, country, currency, candidateIds }) {
      const candidates = await wallArtCandidates(sessionId, [...new Set(candidateIds)])
      const adapter = provider('gelato')
      const costs = []
      for (let offset = 0; offset < candidates.length; offset += 4) {
        costs.push(...await Promise.all(candidates.slice(offset, offset + 4).map(async candidate => {
          try {
            const result = await adapter.marketPrice({ variantId: candidate.external_variant_id, country, currency })
            return { candidateId: candidate.id, ...result }
          } catch (error) {
            if (!error.code) throw error
            return { candidateId: candidate.id, error: error.code }
          }
        })))
      }
      return costs
    },
    async saveWallArtDrafts({ sessionId, products }) {
      const variants = products.flatMap(product => product.variants)
      const ids = variants.map(variant => variant.candidateId)
      if (ids.length > 12 || new Set(ids).size !== ids.length || variants.some(item =>
        new Set(item.prices.map(price => price.bookId)).size !== item.prices.length)) {
        throw new HttpError(400, 'wall_art_selection_invalid')
      }
      const candidates = new Map((await wallArtCandidates(sessionId, ids)).map(candidate => [candidate.id, candidate]))
      const ready = products.map(product => {
        if (product.variants.some(item => wallArtGroup({
          externalId: candidates.get(item.candidateId).external_id,
          title: candidates.get(item.candidateId).provider_catalog_variants?.specification?.title,
        }) !== product.group)) throw new HttpError(400, 'wall_art_selection_invalid')
        return { ...product, family: wallArtProductFamily(product.group) }
      })
      return checked(db.rpc('save_wall_art_studio', { _actor: actor, _session: sessionId, _products: ready }))
    },
    async listSessions({ offset = 0 }) {
      return checked(db.from('product_discovery_sessions').select('*,artworks(title,sku)').order('created_at', { ascending: false }).range(offset, offset + 24))
    },
    async resumeSession({ sessionId }) {
      const [session, candidates] = await Promise.all([
        checked(db.from('product_discovery_sessions').select('*').eq('id', sessionId).maybeSingle(), 'session_missing'),
        checked(db.from('product_discovery_candidates').select('*,provider_catalog_variants(external_sku,specification),product_discovery_selections(product_variant_id,configuration),provider_quotes(id,country,currency,manufacturing_minor,shipping_minor,tax_minor,expires_at,options)')
          .eq('session_id', sessionId).order('created_at').limit(100)),
      ])
      return { session, candidates: candidates.map(candidate => ({
        ...candidate, provider_quotes: candidate.provider_quotes.filter(quote => !quote.options.fulfillmentJobId),
      })) }
    },
    async createSession({ artworkId, sourceAssetId, ...criteria }) {
      if (sourceAssetId) {
        const asset = await checked(db.from('art_assets').select('artwork_id,visibility').eq('id', sourceAssetId).maybeSingle(), 'asset_missing')
        if (!artworkId || asset.artwork_id !== artworkId || asset.visibility !== 'private') throw new HttpError(400, 'source_asset_mismatch')
      }
      const session = await checked(db.from('product_discovery_sessions').insert({
        artwork_id: artworkId, source_asset_id: sourceAssetId, criteria, created_by: actor,
      }).select().single())
      await audit('open_discovery', session.id)
      return session
    },
    async addCandidate({ sessionId, provider: name, externalId, variantId, category, offset }) {
      const session = await checked(db.from('product_discovery_sessions').select('*').eq('id', sessionId).maybeSingle(), 'session_missing')
      if (session.state === 'archived' || !session.criteria.providers?.includes(name)) throw new HttpError(409, 'provider_not_in_session')
      const product = await provider(name).product(externalId, { offset })
      const variant = product.variants.find(row => row.externalVariantId === variantId)
      if (!variant || product.externalId !== externalId) throw new HttpError(400, 'provider_variant_mismatch')
      const asset = session.source_asset_id && await checked(db.from('art_assets').select('width_px,height_px')
        .eq('id', session.source_asset_id).maybeSingle())
      const required = variant.printAreas?.filter(area => area.required)
      const area = required?.length === 1 ? required[0] : null
      const compatibility = analyzeCompatibility({ widthPx: asset?.width_px, heightPx: asset?.height_px }, {
        widthMm: area?.widthMm, heightMm: area?.heightMm, minimumDpi: area?.recommendedDpi,
        // Current responses don't establish whether this area includes bleed.
        bleedMm: null, printableAreaVerified: Boolean(area),
      })
      if (area?.widthMm && area?.heightMm && asset?.width_px && asset?.height_px) {
        const optimisticDpi = Math.floor(25.4 * Math.min(asset.width_px / area.widthMm, asset.height_px / area.heightMm))
        compatibility.optimisticDpi = optimisticDpi
        if (area.recommendedDpi && optimisticDpi < area.recommendedDpi) compatibility.status = 'requires_validation'
      }
      const spec = Object.fromEntries(Object.entries(product).filter(([key]) => key !== 'variants'))
      await checked(db.from('provider_catalog_products').upsert({
        provider_code: name, external_id: externalId, title: product.title, category: product.category || category,
        specification: spec, synced_at: new Date().toISOString(),
      }))
      await checked(db.from('provider_catalog_variants').upsert({
        provider_code: name, external_id: externalId, external_variant_id: variantId, external_sku: variant.sku, specification: variant,
      }))
      await checked(db.from('product_discovery_candidates').upsert({
        session_id: sessionId, provider_code: name, external_id: externalId, external_variant_id: variantId, compatibility,
      }, { onConflict: 'session_id,provider_code,external_id,external_variant_id', ignoreDuplicates: true }))
      const row = await checked(db.from('product_discovery_candidates').select('*').eq('session_id', sessionId)
        .eq('provider_code', name).eq('external_id', externalId).eq('external_variant_id', variantId).single())
      await audit('save_discovery_candidate', row.id)
      return row
    },
    async validateCompatibility({ candidateId, ...requirements }) {
      const candidate = await candidateDetails(db, candidateId)
      const session = await checked(db.from('product_discovery_sessions').select('source_asset_id,state')
        .eq('id', candidate.session_id).maybeSingle(), 'session_missing')
      if (!session.source_asset_id || session.state === 'archived') throw new HttpError(409, 'source_asset_required')
      const asset = await checked(db.from('art_assets').select('width_px,height_px')
        .eq('id', session.source_asset_id).maybeSingle(), 'asset_missing')
      const compatibility = { ...analyzeCompatibility({ widthPx: asset.width_px, heightPx: asset.height_px }, requirements),
        validatedBy: actor, validatedAt: new Date().toISOString(), requirements }
      await checked(db.from('product_discovery_candidates').update({ compatibility }).eq('id', candidateId))
      await audit('validate_candidate_compatibility', candidateId)
      return compatibility
    },
    async quoteCandidate({ candidateId, ...input }) {
      const candidate = await candidateDetails(db, candidateId)
      if (!compatibleOptions(candidate.provider_catalog_variants.specification, input.attributes)) {
        throw new HttpError(400, 'unverified_provider_configuration')
      }
      const quote = await provider(candidate.provider_code).quote({ ...input, variantId: candidate.external_variant_id })
      // Address inputs are used for the request only.
      const row = await checked(db.from('provider_quotes').insert({
        candidate_id: candidateId, country: quote.country, currency: quote.currency,
        manufacturing_minor: quote.manufacturingMinor, shipping_minor: quote.shippingMinor, tax_minor: quote.taxMinor,
        quoted_at: quote.quotedAt, expires_at: quote.expiresAt, options: { quantity: input.quantity, methods: quote.options,
          attributes: input.attributes || {} }, created_by: actor,
      }).select().single())
      await audit('quote_candidate', row.id)
      return row
    },
    async proposePrice({ quoteId, currency, policy, assumedTaxMinor, fx }) {
      const row = await checked(db.from('provider_quotes').select('*').eq('id', quoteId).maybeSingle(), 'quote_missing')
      if (row.options.fulfillmentJobId || row.options.quantity !== 1) throw new HttpError(409, 'single_unit_quote_required')
      if (row.tax_minor == null && assumedTaxMinor == null) throw new HttpError(400, 'explicit_tax_assumption_required')
      try {
        const result = proposePrice({ quote: { currency: row.currency, expiresAt: row.expires_at,
          manufacturingMinor: row.manufacturing_minor, shippingMinor: row.shipping_minor,
          taxMinor: row.tax_minor ?? assumedTaxMinor }, currency, policy, fx })
        return { ...result, quoteId, country: row.country, assumptions: { ...result.assumptions,
          taxMinor: row.tax_minor ?? assumedTaxMinor, taxEstimated: row.tax_minor == null } }
      } catch (error) {
        throw new HttpError(422, error.message)
      }
    },
    async createDraft({ artworkId, candidateId, quoteId, product, variant }) {
      return checked(db.rpc('create_catalog_product_draft', {
        _actor: actor, _product: product, _variant: variant, _artwork: artworkId || null, _candidate: candidateId || null, _quote: quoteId || null,
      }))
    },
    async editProduct({ productId, titleEs, titleEn, descriptionEs, descriptionEn }) {
      await draftProduct(db, productId)
      const row = await checked(db.from('products').update({ title_es: titleEs, title_en: titleEn ?? null,
        description_es: descriptionEs ?? null, description_en: descriptionEn ?? null, updated_at: new Date().toISOString() })
        .eq('id', productId).eq('status','draft').select('id').maybeSingle(), 'product_missing')
      await audit('edit_product_draft', row.id)
      return row
    },
    async addVariant({ productId, variant }) {
      await draftProduct(db, productId)
      const row = await checked(db.from('product_variants').insert({
        product_id: productId, sku: variant.sku, fulfillment_type: variant.fulfillmentType, inventory_policy: variant.inventoryPolicy,
      }).select('id').single())
      await audit('add_variant', row.id)
      return row
    },
    async setVariantAttribute({ variantId, attribute, value }) {
      const { product } = await writableVariant(db, variantId)
      const link = await checked(db.from('product_family_attributes').select('product_attributes(value_type)')
        .eq('family_code', product.family_code).eq('attribute_code', attribute).maybeSingle(), 'attribute_not_applicable')
      const type = link.product_attributes.value_type
      const columns = { text_value: null, enum_value: null, number_value: null, boolean_value: null }
      const valid = typeof value === 'string' && ['string','enum'].includes(type) ? (type === 'enum' ? 'enum_value' : 'text_value')
        : typeof value === 'number' && (type === 'number' || (type === 'measurement' && value > 0)) ? 'number_value'
        : typeof value === 'boolean' && type === 'boolean' ? 'boolean_value' : null
      if (!valid) throw new HttpError(400, 'invalid_attribute_value')
      await checked(db.from('product_variant_attribute_values').upsert({ variant_id: variantId, attribute_code: attribute, ...columns, [valid]: value }))
      await audit('set_variant_attribute', variantId)
      return { saved: true }
    },
    async addPriceDraft({ bookId, variantId, amountMinor, validFrom, validTo, proposal }) {
      await writableVariant(db, variantId)
      const book = await checked(db.from('price_books').select('status,currency,country').eq('id', bookId).maybeSingle(), 'book_missing')
      if (!['draft','active'].includes(book.status)) throw new HttpError(409, 'price_book_unavailable')
      let proposalData = null
      if (proposal) {
        proposalData = await api.proposePrice({ ...proposal, currency: book.currency })
        const quote = await checked(db.from('provider_quotes').select('candidate_id,options').eq('id', proposal.quoteId).maybeSingle(), 'quote_missing')
        const selected = await checked(db.from('product_discovery_selections').select('product_variant_id')
          .eq('candidate_id', quote.candidate_id).eq('product_variant_id', variantId).eq('configuration', JSON.stringify(quote.options.attributes || {}))
          .maybeSingle(), 'proposal_variant_mismatch')
        if (!selected || proposalData.country !== book.country) throw new HttpError(409, 'proposal_market_mismatch')
      }
      const row = await checked(db.from('price_book_entries').insert({
        price_book_id: bookId, product_variant_id: variantId, amount_minor: amountMinor, valid_from: validFrom, valid_to: validTo,
        provider_quote_id: proposal?.quoteId, proposal_assumptions: proposalData,
      }).select('id').single())
      await audit('create_price_draft', row.id)
      return row
    },
    async setVariantCountries({ variantId, countries }) {
      await writableVariant(db, variantId)
      await checked(db.from('product_variants').update({ allowed_countries: [...new Set(countries)] }).eq('id', variantId))
      await audit('set_variant_countries', variantId)
      return { saved: true }
    },
    async linkArtwork({ productId, artworkId, primary }) {
      await draftProduct(db, productId)
      await checked(db.from('artwork_products').upsert({ artwork_id: artworkId, product_id: productId,
        relationship_type: 'featured', is_primary: primary === true }))
      await audit('link_product_artwork', productId)
      return { saved: true }
    },
    async addArtworkPhoto({ productId, artworkId }) {
      await draftProduct(db, productId)
      await checked(db.from('artwork_products').select('artwork_id').eq('product_id', productId)
        .eq('artwork_id', artworkId).limit(1).maybeSingle(), 'artwork_not_linked')
      const artwork = await checked(db.from('artworks').select('primary_image_url').eq('id', artworkId).maybeSingle(), 'artwork_missing')
      if (!artwork.primary_image_url) throw new HttpError(409, 'public_image_required')
      const asset = await checked(db.from('art_assets').upsert({ artwork_id: artworkId, asset_type: 'original_photo',
        visibility: 'public', public_url: artwork.primary_image_url }, { onConflict: 'artwork_id,public_url,asset_type' }).select('id').single())
      await checked(db.from('product_media').upsert({ product_id: productId, asset_id: asset.id }))
      await audit('add_product_photo', productId)
      return { saved: true }
    },
    async linkProviderCandidate({ variantId, candidateId }) {
      const variant = await checked(db.from('product_variants').select('id,product_id').eq('id',variantId).maybeSingle(), 'variant_missing')
      const candidate = await candidateDetails(db, candidateId)
      const session = await checked(db.from('product_discovery_sessions').select('artwork_id').eq('id',candidate.session_id).maybeSingle(), 'session_missing')
      if (!session.artwork_id || candidate.compatibility.status === 'incompatible') throw new HttpError(409, 'incompatible_candidate')
      await checked(db.from('artwork_products').select('artwork_id').eq('artwork_id',session.artwork_id)
        .eq('product_id',variant.product_id).limit(1).maybeSingle(), 'artwork_not_linked')
      await checked(db.from('provider_product_mappings').upsert({
        product_variant_id: variant.id, provider_code: candidate.provider_code, external_id: candidate.external_id,
        external_variant_id: candidate.external_variant_id,
      }, { onConflict: 'product_variant_id,provider_code,external_id,external_variant_id', ignoreDuplicates: true }))
      await audit('link_provider_candidate', variant.id)
      return { saved: true }
    },
    async enableMapping({ mappingId, assetId, countries }) {
      const row = await checked(db.from('provider_product_mappings')
        .select('provider_code,provider_catalog_variants(specification)').eq('id',mappingId).maybeSingle(), 'mapping_missing')
      const areas = row.provider_catalog_variants?.specification?.printAreas
      if (row.provider_code === 'prodigi' && (!Array.isArray(areas) || areas.filter(area => area.required).length !== 1 ||
        !areas.some(area => area.required && area.name === 'default'))) throw new HttpError(409, 'unsupported_print_areas')
      await checked(db.rpc('enable_catalog_provider_mapping', {
        _actor: actor, _mapping: mappingId, _asset: assetId, _countries: [...new Set(countries)],
      }))
      return { enabled: true }
    },
    async reviewProduct({ productId }) {
      await checked(db.rpc('review_catalog_product', { _actor: actor, _product: productId }))
      return { saved: true }
    },
    async addBookDraft(input) {
      const row = await checked(db.from('price_books').insert(input).select('id').single())
      await audit('create_book_draft', row.id)
      return row
    },
    async approvePrice({ entryId }) {
      await checked(db.rpc('approve_catalog_price', { _actor: actor, _entry: entryId }))
      return { approved: true }
    },
    async activateBook({ bookId }) {
      await checked(db.rpc('activate_catalog_price_book', { _actor: actor, _book: bookId }))
      return { activated: true }
    },
    async resolvePrice({ variantId, country, currency, channel, segment }) {
      const [variant, entries, books] = await Promise.all([
        checked(db.from('product_variants').select('id,status,allowed_countries,products(status)').eq('id', variantId).maybeSingle(), 'variant_missing'),
        checked(db.from('price_book_entries').select('*').eq('product_variant_id', variantId).eq('status','active')),
        checked(db.from('price_books').select('*').eq('status','active').eq('currency', currency)),
      ])
      if (variant.products.status !== 'published') return { available: false, explanation: 'product_unpublished' }
      return resolvePrice({ variant, entries, books, country, currency, channel, segment })
    },
  }
  return api
}
