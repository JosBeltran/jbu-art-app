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
const {fineArtPublic,loadFineArtVariants}=await import('./commerce.server.js')
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

test('public prints preserve verified photos and use only eligible Studio mockups for the exact version', async () => {
  const prior='10000000-0000-4000-8000-000000000019'
  const mk=(id, artwork, amount, gallery=[])=>({
    id,sku:id,allowed_countries:['MX'],product_variant_attribute_values:[],product_variant_assets:gallery,
    products:{id:artwork.id,family_code:'fine_art_print',title_es:artwork.title,artwork_products:[{artworks:artwork}]},
    provider_product_mappings:[{id:'mapping',provider_code:'gelato',external_variant_id:'supplier',external_configuration:{}}],
    price_book_entries:[{id:'entry-'+id,product_variant_id:id,price_book_id:'book',amount_minor:amount,status:'active',
      price_books:{id:'book',country:'MX',currency:'MXN',status:'active',channel:'storefront',priority:1}}],
  })
  const current={id:artworkId,sku:'JBU-034',title:'La Silla del Cantor'}
  const earlier={id:prior,sku:'ver-632a9b92e6a1c130',title:'Industrial Pulse · versión anterior'}
  const rows=[
    mk('control',current,125000,[{is_primary:true,verified_at:'2026-11-01',configuration_snapshot:{},
      art_assets:{visibility:'public',processing_status:'ready',asset_type:'mockup',public_url:'/commercial.webp'}}]),
    ...[150384,130000,116077].map((amount,index)=>mk('prior-'+index,earlier,amount)),
    mk('no-image',earlier,90000),
  ]
  let requestedMockups
  const db={
    rpc(name,args){
      if(name==='public_fine_art_variant_ids') return {range:async()=>({data:rows.map(({id})=>({id}))})}
      assert.equal(name,'fine_art_studio_default_mockups')
      requestedMockups=args._variants
      return {select:async()=>({data:requestedMockups.filter(id=>id.startsWith('prior-')).map(variant_id=>({variant_id,source_url:'/historic.webp'}))})}
    },
    from(){return {select(){return this},in(){return this},eq(){return this},then(resolve){return Promise.resolve({data:rows}).then(resolve)}}},
  }
  const data=await loadFineArtVariants(db,{globalCountries:['MX']})
  assert.deepEqual(requestedMockups,['prior-0','prior-1','prior-2','no-image'])
  assert.deepEqual(data.map(row=>[row.artworkId,row.artworkSku,row.gallery[0].url,row.entries[0].amount_minor]),[
    [artworkId,'JBU-034','/commercial.webp',125000],
    ...[150384,130000,116077].map(amount=>[prior,'ver-632a9b92e6a1c130','/historic.webp',amount]),
  ])
  assert.equal(data[1].supplierConfiguration[0].variant,'supplier')
  const error={code:'57014'}
  const errors=[]
  const partialDb={...db,rpc(name,args) {
    if(name==='public_listed_fine_art_variant_ids') {
      assert.deepEqual(args,{_artworks:[artworkId],_variants:null})
      return {range:async()=>({data:rows.map(({id})=>({id}))})}
    }
    assert.equal(name,'fine_art_studio_default_mockups')
    return {select:async()=>({error})}
  }}
  const partial=await loadFineArtVariants(partialDb,{globalCountries:['MX']},{
    artworkIds:[artworkId],listing:true,onPartialError:failure=>errors.push(failure),
  })
  assert.deepEqual(partial.map(row=>row.id),['control'])
  assert.deepEqual(errors,[error])
  const future=rows[0]
  future.price_book_entries[0].valid_from='2099-01-01T00:00:00.000Z'
  const scheduled=await loadFineArtVariants(db,{globalCountries:['MX']},{deferPriceValidity:true})
  assert.equal(scheduled.find(row=>row.id==='control').entries[0].valid_from,'2099-01-01T00:00:00.000Z')
  assert.ok(!(await loadFineArtVariants(db,{globalCountries:['MX']})).some(row=>row.id==='control'))
})

test('public variants carry exact prepared-print borders separately from mockup geometry',async()=>{
  const rows=['A2','A3'].flatMap(size=>[5,10].map(value=>{
    const id=size+'-'+value
    return {...variant,id,artwork_print_id:'print-'+id,
      source_print:{id:'print-'+id,artwork_id:artworkId,border_unit:'percent',border_value:String(value)},
      product_variant_assets:[],
      product_variant_attribute_values:[{attribute_code:'size',text_value:size},{attribute_code:'jbu_border',text_value:'0 mm'}],
      wall_art_mockups:{width_mm:size==='A2'?420:297,height_mm:size==='A2'?594:420,border_mm:0,fit:'contain',scenes:['gallery']},
      price_book_entries:[{...entry,product_variant_id:id}],
    }
  }))
  const db={
    rpc(name,args){
      if(name==='public_fine_art_variant_ids')return {range:async()=>({data:rows.map(({id})=>({id}))})}
      assert.equal(name,'fine_art_studio_default_mockups')
      return {select:async()=>({data:args._variants.map(variant_id=>({variant_id,source_url:'https://example.test/'+variant_id+'.webp'}))})}
    },
    from(table){
      assert.equal(table,'product_variants')
      return {select(query){assert.ok(query.includes('source_print:artwork_prints!product_variants_artwork_print_id_fkey'));return this},
        in(){return this},eq(){return this},then(resolve){return Promise.resolve({data:rows}).then(resolve)}}
    },
  }
  const result=await loadFineArtVariants(db,{globalCountries:['MX']})
  assert.equal(result.length,4)
  assert.deepEqual(result.map(row=>[row.id,row.presentationBorder,row.gallery[0].url,row.previewGeometry.borderMm]),rows.map(row=>[
    row.id,{unit:'percent',value:Number(row.source_print.border_value)},'https://example.test/'+row.id+'.webp',0,
  ]))
  assert.deepEqual(result.map(row=>row.attributes.find(attr=>attr.code==='jbu_border').value),['5 %','10 %','5 %','10 %'])
  assert.ok(result.every(row=>fineArtPublic(row).presentationBorder))
  rows[0].source_print.artwork_id='another-artwork'
  const mismatch=await loadFineArtVariants(db,{globalCountries:['MX']})
  assert.equal(mismatch[0].presentationBorder,null,'Never infer a border from a print of another artwork')
})
