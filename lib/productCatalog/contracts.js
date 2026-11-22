import { z } from 'zod'
import { printBorderOptions, wallArtFamilies } from './wallArt.js'
import { SHIPPING_COUNTRY_CODES } from '../shippingCountries.js'

const uuid = z.string().uuid()
const line = (max = 240) => z.string().trim().min(1).max(max)
const sku = line(100)
const country = z.enum(SHIPPING_COUNTRY_CODES)
const currency = z.string().regex(/^[A-Z]{3}$/)
const amount = z.number().int().min(1).max(999999999999)
const provider = z.enum(['gelato','prodigi'])
const page = { limit: z.number().int().min(1).max(25).optional(), offset: z.number().int().min(0).max(10000).optional() }
const editorialFields = { titleEs: line(), titleEn: line().optional(),
  descriptionEs: line(4000).optional(), descriptionEn: line(4000).optional() }
const product = z.object({ sku, family: line(50), ...editorialFields })
const variant = z.object({ sku, fulfillmentType: z.enum(['manual','provider','digital']),
  inventoryPolicy: z.enum(['finite','made_to_order','unlimited']) })
const draftEntry = { variantId: uuid, bookId: uuid, amountMinor: amount,
  validFrom: z.string().datetime({ offset: true }).optional(), validTo: z.string().datetime({ offset: true }).optional() }
const pricingPolicy = z.object({
  type: z.enum(['markup','target_margin','minimum_margin','manual']), value: z.number().int().nonnegative().max(999999999999),
  baseMinor: amount.optional(), roundingStepMinor: amount.optional(), roundingEndingMinor: z.number().int().nonnegative().optional(),
})

const exchangeRate = z.object({
  from: currency, to: currency, source: line(100), asOf: z.string().datetime({ offset: true }),
  minorRate: z.number().positive().max(100000),
})

const studioConfiguration = z.record(line(80),line(160))
const wallArtDraft = z.object({
  ...editorialFields,
  group: z.enum(Object.keys(wallArtFamilies)),
  variants: z.array(z.object({ candidateId: uuid, configuration:studioConfiguration.optional(),
    fit: z.enum(['contain','cover']), borderMm: z.literal(printBorderOptions).optional(), scenes: z.array(z.enum(['gallery','wall'])).min(1).max(2),
    primaryScene: z.enum(['gallery','wall']),
    prices: z.array(z.object({ bookId: uuid, amountMinor: amount })).max(20),
  }).refine(item => item.scenes.includes(item.primaryScene), { path: ['primaryScene'] })).min(1).max(12),
})

const nativeInput={provider,catalogId:line(300),presentationId:line(500),country,selection:studioConfiguration.optional(),offset:z.number().int().min(0).max(10000000).optional()}
const nativeExact={...nativeInput,externalId:line(300),variantId:line(300),configuration:studioConfiguration.optional()}

export const operations = {
  nativeDiscover:{mode:'read',schema:z.object({provider,category:line(80).optional(),country:country.optional(),complete:z.boolean().optional(),refresh:z.boolean().optional(),offset:z.number().int().min(0).max(1000).optional()})},
  nativeDefinition:{mode:'read',schema:z.object({provider,catalogId:line(300)})},
  nativeMatrixSnapshot:{mode:'read',schema:z.object({provider,catalogId:line(300),presentationId:line(500),country,refresh:z.boolean().optional()})},
  nativeMatrixPage:{mode:'read',schema:z.object(nativeInput)},
  nativeConfigure:{mode:'read',schema:z.object(nativeInput)},
  nativeResolve:{mode:'read',schema:z.object(nativeExact)},
  removeStudioSelection:{mode:'draft',schema:z.object({sessionId:uuid,candidateId:uuid,configuration:studioConfiguration.optional()})},
  addNativeCandidate:{mode:'draft',schema:z.object({sessionId:uuid,...nativeExact})},
  list: { mode: 'read', schema: z.object({ offset: page.offset }) },
  supplierSyncStatus: {mode:'read',schema:z.object({})},
  supplierSyncStart: {mode:'draft',schema:z.object({provider,retry:z.boolean().optional()})},
  supplierSyncAdvance: {mode:'draft',schema:z.object({provider})},
  supplierSyncSchedule: {mode:'draft',schema:z.object({provider,enabled:z.boolean(),intervalHours:z.number().int().min(1).max(720)})},
  studioDiscover: {mode:'read',schema:z.object({provider:z.enum(['all','gelato','prodigi']),country,
    query:z.string().trim().max(160).optional(),family:z.enum(['',...Object.keys(wallArtFamilies)]).optional(),
    offset:z.number().int().min(0).max(10000000).optional(),sort:z.enum(['title','supplier']).optional()})},
  studioVariantCost: { mode:'read',schema:z.object({ provider,variantId:line(300),country,currency }) },
  studioVariants: { mode:'read',schema:z.object({ provider, externalId:line(300),groupKey:line(180),revision:uuid,offset:z.number().int().min(0).max(10000000).optional(),country }) },
  wallArtCosts: { mode: 'read', schema: z.object({ sessionId: uuid, country, currency, candidateIds: z.array(uuid).min(1).max(12) }) },
  saveWallArtDrafts: { mode: 'draft', schema: z.object({ sessionId: uuid, products: z.array(wallArtDraft).min(1).max(6) }) },
  artworkSearch: { mode: 'read', schema: z.object({ query: line(160) }) },
  artworkAssets: { mode: 'read', schema: z.object({ artworkId: uuid }) },
  productDetails: { mode: 'read', schema: z.object({ productId: uuid }) },
  categories: { mode: 'read', schema: z.object({ provider, ...page }) },
  searchCatalog: { mode: 'read', schema: z.object({ provider, query: line(140).optional(), category: line(160).optional(), ...page }) },
  inspectProduct: { mode: 'read', schema: z.object({ provider, externalId: line(300), ...page }) },
  listSessions: { mode: 'read', schema: z.object({ offset: page.offset }) },
  resumeSession: { mode: 'read', schema: z.object({ sessionId: uuid }) },
  resolvePrice: { mode: 'read', schema: z.object({ variantId: uuid, country, currency, channel: line(64).optional(), segment: line(64).optional() }) },
  proposePrice: { mode: 'read', schema: z.object({ quoteId: uuid, currency, policy: pricingPolicy,
    assumedTaxMinor: z.number().int().min(0).max(999999999999).optional(), fx: exchangeRate.optional() }) },
  registerProductionAsset: { mode: 'draft', schema: z.object({ revisionId: uuid }) },
  createSession: { mode: 'draft', schema: z.object({ artworkId: uuid.optional(), sourceAssetId: uuid.optional(),
    workflow: z.literal('wall_art').optional(), providers: z.array(provider).min(1).max(2), countries: z.array(country).max(25), query: line(140).optional(),
    category: line(160).optional() }) },
  addCandidate: { mode: 'draft', schema: z.object({ sessionId: uuid, provider, externalId: line(300), variantId: line(300),
    category: line(160).optional(), offset: page.offset,revision:uuid.optional(),groupKey:line(180).optional() }) },
  validateCompatibility: { mode: 'draft', schema: z.object({ candidateId: uuid, widthMm: z.number().positive().max(6000),
    heightMm: z.number().positive().max(6000), minimumDpi: z.number().positive().max(2400),
    bleedMm: z.number().nonnegative().max(100), printableAreaVerified: z.literal(true) }) },
  quoteCandidate: { mode: 'draft', schema: z.object({ candidateId: uuid, currency,
    attributes: z.record(line(80),line(160)).optional(),
    quantity: z.number().int().min(1).max(1000),
    destination: z.object({ country, line1: line(100), city: line(50), postalCode: line(20), region: line(50).optional() }) }) },
  createDraft: { mode: 'draft', schema: z.object({ artworkId: uuid.optional(), candidateId: uuid.optional(), quoteId: uuid.optional(), product, variant }) },
  editProduct: { mode: 'draft', schema: z.object({ productId: uuid, ...editorialFields }) },
  addVariant: { mode: 'draft', schema: z.object({ productId: uuid, variant }) },
  setVariantAttribute: { mode: 'draft', schema: z.object({ variantId: uuid, attribute: line(50),
    value: z.union([line(240),z.number().finite(),z.boolean()]) }) },
  addPriceDraft: { mode: 'draft', schema: z.object({ ...draftEntry,
    proposal: z.object({ quoteId: uuid, policy: pricingPolicy, assumedTaxMinor: z.number().int().nonnegative().optional(), fx: exchangeRate.optional() }).optional(),
  }) },
  setVariantCountries: { mode: 'draft', schema: z.object({ variantId: uuid, countries: z.array(country).max(100) }) },
  linkArtwork: { mode: 'draft', schema: z.object({ productId: uuid, artworkId: uuid, primary: z.boolean().optional() }) },
  addArtworkPhoto: { mode: 'draft', schema: z.object({ productId: uuid, artworkId: uuid }) },
  linkProviderCandidate: { mode: 'draft', schema: z.object({ variantId: uuid, candidateId: uuid }) },
  enableMapping: { mode: 'protected', schema: z.object({ mappingId: uuid, assetId: uuid, countries: z.array(country).min(1).max(100), verifiedSingleDefaultArea: z.literal(true), confirm: z.literal(true) }) },
  prepareFulfillment: { mode: 'protected', schema: z.object({ orderItemId: uuid, mappingId: uuid, confirm: z.literal(true) }) },
  quoteFulfillment: { mode: 'draft', schema: z.object({ jobId: uuid, candidateId: uuid, currency }) },
  approveFulfillment: { mode: 'protected', schema: z.object({ jobId: uuid, quoteId: uuid, shippingMethod: line(180), confirm: z.literal(true) }) },
  submitFulfillment: { mode: 'protected', schema: z.object({ jobId: uuid, confirm: z.literal(true) }) },
  syncFulfillment: { mode: 'draft', schema: z.object({ jobId: uuid }) },
  listFulfillment: { mode: 'read', schema: z.object({ offset: page.offset }) },
  publicationStatus: { mode: 'read', schema: z.object({ variantId: uuid }) },
  transitionPublication: { mode: 'protected', schema: z.object({ productId: uuid, variantId: uuid.optional(),
    action: z.enum(['approve','publish','unpublish','revise','archive']), confirm: z.literal(true) }) },
  removeCommercialImage: { mode: 'draft', schema: z.object({ variantId: uuid, assetId: uuid }) },
  selectCommercialPrimary: { mode: 'draft', schema: z.object({ variantId: uuid, assetId: uuid }) },
  setLegacyReplacement: { mode: 'draft', schema: z.object({ variantId: uuid, printId: uuid.nullable() }) },
  setProductionAsset: { mode: 'draft', schema: z.object({ variantId: uuid, assetId: uuid }) },
  reviewProduct: { mode: 'protected', schema: z.object({ productId: uuid, confirm: z.literal(true) }) },

  addBookDraft: { mode: 'draft', schema: z.object({ code: line(64).regex(/^[a-z0-9-]+$/), name: line(150),
    country, currency, priority: z.number().int().min(-1000).max(1000).default(0) }) },
  approvePrice: { mode: 'protected', schema: z.object({ entryId: uuid, confirm: z.literal(true) }) },
  activateBook: { mode: 'protected', schema: z.object({ bookId: uuid, confirm: z.literal(true) }) },
}
