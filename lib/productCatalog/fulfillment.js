import { HttpError } from '../certificates/adminAuth.server.js'
import { checked } from './service.js'

export function fulfillmentService(db, actor, adapter) {
  return {
    async listFulfillment({ offset = 0 }) {
      return checked(db.from('catalog_fulfillment_jobs').select('id,order_item_id,provider_code,state,provider_order_id,provider_status,country')
        .order('created_at', { ascending: false }).range(offset, offset + 24))
    },
    async prepareFulfillment({ orderItemId, mappingId }) {
      const id = await checked(db.rpc('prepare_catalog_fulfillment', { _actor: actor, _item: orderItemId, _mapping: mappingId }))
      return { id }
    },
    async quoteFulfillment({ jobId, candidateId, currency }) {
      const context = await checked(db.rpc('catalog_fulfillment_quote_context', { _job: jobId }), 'job_missing')
      const candidate = await checked(db.from('product_discovery_candidates').select('provider_code,external_variant_id')
        .eq('id', candidateId).maybeSingle(), 'candidate_missing')
      if (candidate.provider_code !== context.provider || candidate.external_variant_id !== context.snapshot.externalVariantId) {
        throw new HttpError(409, 'provider_variant_mismatch')
      }
      const { address, snapshot } = context
      const destination = { line1: address.line1, city: address.city, postalCode: address.postal_code, country: address.country,
        region: address.state }
      if (![destination.line1, destination.city, destination.postalCode, destination.country]
        .every(value => typeof value === 'string' && value.trim())) throw new HttpError(409, 'fulfillment_destination_incomplete')
      const quote = await adapter(context.provider).quote({
        currency, destination, quantity: snapshot.quantity, attributes: snapshot.configuration, variantId: snapshot.externalVariantId,
      })
      const saved = await checked(db.from('provider_quotes').insert({
        candidate_id: candidateId, country: context.country, currency: quote.currency, manufacturing_minor: quote.manufacturingMinor,
        shipping_minor: quote.shippingMinor, tax_minor: quote.taxMinor, expires_at: quote.expiresAt,
        options: { quantity: snapshot.quantity, attributes: snapshot.configuration, methods: quote.options,
          fulfillmentJobId: jobId, destinationVersion: context.destinationVersion,
          manufacturingTrace:quote.manufacturingTrace,shippingTrace:quote.shippingTrace }, created_by: actor,
      }).select('id,expires_at,currency').single())
      await checked(db.from('product_catalog_audit').insert({ actor_id: actor, operation: 'quote_fulfillment', subject_id: jobId }))
      return { ...saved, methods: quote.options, manufacturingMinor: quote.manufacturingMinor, taxMinor: quote.taxMinor }
    },
    async approveFulfillment({ jobId, quoteId, shippingMethod }) {
      await checked(db.rpc('approve_catalog_fulfillment', { _actor: actor, _job: jobId, _quote: quoteId, _method: shippingMethod }))
      return { approved: true }
    },
    async submitFulfillment({ jobId }) {
      if (process.env.ENABLE_PRODUCT_PROVIDER_SUBMISSION !== 'true') throw new HttpError(409, 'provider_submission_disabled')
      const job = await checked(db.from('catalog_fulfillment_jobs').select('provider_code').eq('id', jobId).maybeSingle(), 'job_missing')
      const provider = adapter(job.provider_code)
      const claimed = await checked(db.rpc('claim_catalog_fulfillment', { _actor: actor, _job: jobId }))
      try {
        const { snapshot, address, shippingMethod } = claimed
        if (![claimed.name, address.line1, address.city, address.postal_code, address.country, shippingMethod]
          .every(value => typeof value === 'string' && value.trim())) throw new HttpError(409, 'fulfillment_destination_incomplete')
        const { signedUrl } = await checked(db.storage.from('print-masters').createSignedUrl(claimed.storagePath, 86400))
        const result = await provider.submitOrder({
          reference: jobId, variantId: snapshot.externalVariantId, quantity: snapshot.quantity,
          configuration: snapshot.configuration, currency: claimed.quoteCurrency,
          recipient: { name: claimed.name, email: claimed.email, phone: claimed.phone }, address,
          shippingMethod, fileUrl: signedUrl, printArea: 'default',
        })
        const saved = await checked(db.from('catalog_fulfillment_jobs').update({ state: 'submitted',
          provider_order_id: result.id, provider_status: result.status }).eq('id', jobId).eq('state','submitting')
          .select('id,state,provider_status').maybeSingle(), 'fulfillment_already_claimed')
        return saved
      } catch {
        // When a response is lost, the supplier may already have the order.
        // Preserve the claim even if writing the reconciliation state also fails.
        await db.from('catalog_fulfillment_jobs').update({ state: 'reconciliation_required' })
          .eq('id', jobId).eq('state','submitting')
        throw new HttpError(409, 'fulfillment_reconciliation_required')
      }
    },
    async syncFulfillment({ jobId }) {
      const row = await checked(db.from('catalog_fulfillment_jobs').select('provider_order_id,provider_code,state').eq('id',jobId).maybeSingle(), 'job_missing')
      if (!row.provider_order_id || row.state !== 'submitted') throw new HttpError(409, 'fulfillment_not_eligible')
      const status = await adapter(row.provider_code).orderStatus(row.provider_order_id)
      if (status.id !== row.provider_order_id) throw new HttpError(502, 'provider_order_mismatch')
      return checked(db.from('catalog_fulfillment_jobs').update({ provider_status: status.status }).eq('id',jobId)
        .select('id,state,provider_status').single())
    },
  }
}
