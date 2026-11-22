import assert from 'node:assert/strict'
import test from 'node:test'
import { registerHooks } from 'node:module'

// The guard is a Next resolver alias. In this isolated Node test the service
// runs on the server and neither database nor Stripe credentials are used.
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url:'data:text/javascript,export%20%7B%7D',shortCircuit:true }
    return next(specifier,context)
  },
})
const { startFineArtCheckout, completeFineArtCheckout } = await import('./commerceCheckout.server.js')
const {fineArtPublic}=await import('./commerce.server.js')
hook.deregister()

const variantId = '10000000-0000-4000-8000-000000000001'
const artworkId = '10000000-0000-4000-8000-000000000002'
const buyer = { id:'10000000-0000-4000-8000-000000000003' }
const checkoutId = '10000000-0000-4000-8000-000000000004'
const policy = { id:'10000000-0000-4000-8000-000000000005',name:'Shipping',name_en:'Shipping',name_es:'Envío',
  method:'INCLUDED',countries:[],amount_minor:0,currency:'MXN',strategy:'PER_ITEM',fulfillment_provider:'ARTIST',
  insurance_required:false,active:true,postal_codes:[] }
const entry = { id:'entry',product_variant_id:variantId,price_book_id:'book',amount_minor:20000,status:'active',
  price_books:{id:'book',status:'active',country:'MX',currency:'MXN',priority:0,channel:'storefront'} }
const variant = {id:variantId,sku:'V',allowed_countries:['MX'],products:{id:'product',family_code:'canvas',
  title_es:'Edición',title_en:'Edition',artwork_products:[{artworks:{id:artworkId,sku:'A'}}]},
  product_variant_attribute_values:[{attribute_code:'size',text_value:'A3'}],
  product_variant_assets:[{is_primary:true,verified_at:'2026-01-01',configuration_snapshot:{providerMappings:[{provider:'gelato',variant:'EXACT-SUPPLIER-UID',configuration:{}}]},art_assets:{visibility:'public',processing_status:'ready',
    asset_type:'mockup',public_url:'https://example.test/render.webp'}}],price_book_entries:[entry] }
const body = {currency:'MXN',destination:'MX',cartItems:[{ type:'CATALOG_PRINT',id:artworkId,variantId,quantity:2,
  currency:'MXN',destination:'MX',amountMinor:20000 }] }

function fixture() {
  const state = {}
  const stripe = { checkout:{sessions:{
    async create(payload) { state.payload=payload;return {id:'cs_test_fixture',url:'https://example.test/checkout'} },
    async listLineItems() { return {has_more:false,data:[{quantity:2,amount_total:40000,amount_subtotal:40000,currency:'mxn',
      price:{product:{metadata:{catalog_variant_id:variantId}}}}]} },
  }} }
  const db = {
    rpc(name,args) {
      if (name==='public_fine_art_variant_ids') return {range:async()=>({data:[{id:variantId}]})}
      if (name==='fine_art_studio_mockups') return {data:[]}
      if (name==='prepare_shipping_checkout') { state.shipping=args;return {data:{id:args._id}} }
      if (name==='bind_shipping_checkout') return {data:true}
      if (name==='fulfill_fine_art_checkout') { state.paid=args;return {data:{orderId:'order',existing:false}} }
      throw new Error(name)
    },
    from(table) {
      const data = {
        site_settings:{global_shipping_countries:['MX'],default_shipping_policies:{open_print:[policy.id]},shipping_revision:1},
        shipping_policies:[policy],product_variants:[variant],fine_art_checkouts:{id:checkoutId},
      }[table]
      return {
        select(){return this}, eq(){return this}, in(){return this}, is(){return this}, order(){return this},
        insert(row){state.manifest=row;return this}, update(row){state.binding=row;return this},
        single(){return this},then(resolve){resolve({data})},
      }
    },
  }
  return { state,stripe,db }
}

test('Checkout and verified paid lines carry the exact market amount and immutable design',async()=>{
  const {state,stripe,db}=fixture()
  const req = new Request('https://example.test/api/checkout')
  await assert.rejects(startFineArtCheckout(db,stripe,req,{...body,cartItems:[{...body.cartItems[0],amountMinor:1}]},buyer,
    {currency:'MXN'}),/catalog_price_changed/)
  assert.equal(state.payload,undefined)
  assert.equal(await startFineArtCheckout(db,stripe,req,body,buyer,{currency:'MXN'}),
    'https://example.test/checkout')
  assert.equal(state.payload.line_items[0].price_data.unit_amount,20000)
  assert.deepEqual(state.payload.shipping_address_collection.allowed_countries,['MX'])
  assert.equal(state.manifest.lines[0].attributes[0].value,'A3')
  assert.equal(state.manifest.lines[0].supplierConfiguration[0].variant,'EXACT-SUPPLIER-UID')
  assert.equal(state.binding.stripe_session_id,'cs_test_fixture')
  await completeFineArtCheckout(db,stripe,{id:'cs_test_fixture',currency:'mxn',amount_total:40000,metadata:state.payload.metadata,
    customer_details:{email:'fixture@example.test'},shipping_details:{address:{country:'MX'}}},{amount_total:40000})
  assert.equal(state.paid._checkout,checkoutId)
  assert.deepEqual(state.paid._paid_lines[variantId],{quantity:2,subtotal:40000,currency:'mxn'})
})

test('public commerce projections exclude supplier identity and configuration snapshots',()=>{
  const row=fineArtPublic({id:variantId,sku:'PRIVATE',artworkShipping:{},supplierConfiguration:[{provider:'gelato',variant:'PRIVATE-UID'}]})
  assert.deepEqual(row,{id:variantId})
})
