import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { scheduledSupplierSync, advanceSupplierSync } from './supplierSync.server.js'
import { normalizeSupplierEntries } from './supplierCatalog.js'
import { PGlite } from '@electric-sql/pglite'

const art = '10000000-0000-4000-8000-000000000001'
const print = '10000000-0000-4000-8000-000000000002'
const actor = '10000000-0000-4000-8000-000000000003'
const migrations = [
  '20261208_independent_product_catalog.sql',
  '20261209_product_catalog_legacy_reference.sql',
  '20261210_product_provider_workflows.sql',
  '20261211_product_fulfillment_preparation.sql',
  '20261212_wall_art_studio.sql',
  '20261213_fine_art_commerce.sql',
  '20261214_unified_product_studio.sql',
  '20261215_persistent_supplier_catalog.sql',
  '20261216_supplier_catalog_worker_heartbeat.sql',
]
const db = new PGlite()
const migration = file => readFile(new URL('../../supabase/migrations/' + file, import.meta.url), 'utf8')
const one = async (sql, params) => (await db.query(sql, params)).rows[0]

before(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema storage;
    create table storage.objects(bucket_id text,name text);
    create function valid_shipping_countries(text[]) returns boolean language sql immutable
      as $$ select $1 is null or $1 <@ array['MX','US','CA','GB','SE']::text[] $$;
    create table artworks(id uuid primary key,title text,title_en text,sku text,primary_image_url text,physical_edition_type text,
      status text,is_historical_version boolean,version_kind text,version_published_at timestamptz,allows_prints boolean,
      print_price_mxn numeric,base_price_mxn numeric,calculated_price_mxn numeric,allowed_shipping_countries text[],shipping_policy_ids uuid[]);
    create table artwork_prints(id uuid primary key,artwork_id uuid references artworks,
      title text,sku text,price numeric,size text,paper_type text,finish text,framing text,edition_type text,allowed_shipping_countries text[]);
    create table site_settings(id boolean primary key,global_shipping_countries text[],default_shipping_policies jsonb);
    insert into site_settings values(true,array['MX','US'],'{"open_print":["10000000-0000-4000-8000-000000000008"]}');
    create table shipping_policies(id uuid primary key,active boolean,method text,postal_codes text[],countries text[]);
    insert into shipping_policies values('10000000-0000-4000-8000-000000000008',true,'INCLUDED','{}','{}');
    create view artworks_discoverable as select * from artworks;
    create table orders(id uuid primary key default gen_random_uuid(),shipping_address jsonb,stripe_session_id text,payment_method text,payment_status text,
      status text,charged_currency text,buyer_name text,buyer_email text,buyer_phone text,stripe_payment_intent_id text,
      total_amount_mxn numeric,paid_at timestamptz,buyer_user_id uuid,charged_amount numeric,fx_usd_per_mxn numeric);
    create table order_items(id uuid primary key default gen_random_uuid(),order_id uuid references orders,print_variant_id uuid references artwork_prints,
      title_snapshot text,unit_price_mxn numeric,quantity integer,artwork_id uuid,sku_snapshot text,
      product_type_snapshot text,print_image_url_snapshot text,print_size_snapshot text,print_finish_snapshot text,claim_token_snapshot text,physical_edition_unit_id uuid);
    create function block_unimplemented_physical_edition_sales() returns trigger language plpgsql
      as $$begin
        if new.artwork_id is null then return new;end if;
        raise exception 'legacy guard fixture';
      end$$;
    create trigger fixture_guard before insert on order_items
       for each row execute function block_unimplemented_physical_edition_sales();
    create table print_order_preparations(item_id uuid,revision_id uuid,state text);
    create table print_asset_generations(revision_id uuid,production_file_path text);
    grant select on artworks,artwork_prints,orders,order_items,print_order_preparations,print_asset_generations to service_role;
    insert into artworks(id,title,sku,status,allows_prints,base_price_mxn,calculated_price_mxn)
      values('${art}','Mar','MAR','AVAILABLE',true,1300,1450);
    insert into artwork_prints(id,artwork_id,title,sku,price,size,paper_type,finish,edition_type)
      values('${print}','${art}','Mar print','MAR-P',400,'A3','Cotton','MATTE','OPEN');
  `)
  for (const file of migrations) await db.exec(await migration(file))
})
after(() => db.close())

test('the migrations preserve legacy rows and repeatably import reference-only amounts', async () => {
  await db.exec(await migration(migrations[1]))
  const prices = await db.query('select amount_minor,status from price_book_entries order by amount_minor')
  assert.deepEqual(prices.rows.map(row => [Number(row.amount_minor), row.status]), [[40000,'reference'],[130000,'reference']])
  assert.equal((await one('select price from artwork_prints where id=$1', [print])).price, '400')
  assert.equal((await one('select count(*)::integer as n from artwork_products where artwork_id=$1', [art])).n, 2)
  await assert.rejects(db.exec('set role anon; select * from price_books'), /permission denied/)
  await db.exec('reset role')
})

test('product drafts can be independent and protected operations enforce SQL eligibility', async () => {
  const product = JSON.stringify({ sku: 'NEW', family: 'fine_art_print', titleEs: 'Mar' })
  const variant = JSON.stringify({ sku: 'NEW-A3', fulfillmentType: 'manual', inventoryPolicy: 'made_to_order' })
  const { result } = await one('select create_catalog_product_draft($1,$2,$3,null,null,null) as result', [actor, product, variant])
  assert.ok(result.product_id)
  assert.equal((await one('select count(*)::integer as n from artwork_products where product_id=$1', [result.product_id])).n, 0)
  await one('select review_catalog_product($1,$2)', [actor, result.product_id])
  assert.equal((await one('select status from products where id=$1', [result.product_id])).status, 'pending_review')
  await assert.rejects(one('select prepare_catalog_fulfillment($1,$2,$3)', [actor, print, print]), /fulfillment_not_eligible/)
  await assert.rejects(one('select claim_catalog_fulfillment($1,$2)', [actor, print]), /fulfillment_already_claimed/)
})

test('paid print claim requires a valid mapping, matching production revision and fresh approved quote', async () => {
  const variant = (await one('select id from product_variants where legacy_print_id=$1', [print])).id
  await db.exec(`
    insert into provider_catalog_products(provider_code,external_id,title) values('gelato','paper','Paper');
    insert into provider_catalog_variants(provider_code,external_id,external_variant_id,external_sku)
      values('gelato','paper','paper','paper');
  `)
  const { id: asset } = await one(`insert into art_assets(artwork_id,asset_type,visibility,storage_bucket,storage_path)
    values($1,'production_derivative','private','print-masters','prepared.jpg') returning id`, [art])
  const { id: mapping } = await one(`insert into provider_product_mappings(product_variant_id,provider_code,external_id,external_variant_id)
    values($1,'gelato','paper','paper') returning id`, [variant])
  await one("select enable_catalog_provider_mapping($1,$2,$3,array['MX'])", [actor, mapping, asset])
  const { id: order } = await one(`insert into orders(id,shipping_address,stripe_session_id,payment_method,payment_status,status)
    values(gen_random_uuid(),'{"country":"MX"}','cs_test_fixture','stripe','PENDING','PENDING') returning id`)
  const { id: item } = await one(`insert into order_items(id,order_id,print_variant_id,title_snapshot,unit_price_mxn,quantity)
    values(gen_random_uuid(),$1,$2,'Print',400,1) returning id`, [order, print])
  await one("insert into print_order_preparations values($1,$2,'READY')", [item, asset])
  await one("insert into print_asset_generations values($1,'prepared.jpg')", [asset])
  await assert.rejects(one('select prepare_catalog_fulfillment($1,$2,$3)', [actor, item, mapping]), /fulfillment_not_eligible/)
  await one("update orders set payment_status='PAID' where id=$1", [order])
  const { id: job } = await one('select prepare_catalog_fulfillment($1,$2,$3) as id', [actor, item, mapping])
  assert.equal((await one('select prepare_catalog_fulfillment($1,$2,$3) as id', [actor, item, mapping])).id, job)
  await assert.rejects(one('select claim_catalog_fulfillment($1,$2)', [actor, job]), /fulfillment_already_claimed/)
  const { id: session } = await one('insert into product_discovery_sessions(created_by) values($1) returning id', [actor])
  const { id: candidate } = await one(`insert into product_discovery_candidates(session_id,provider_code,external_id,external_variant_id)
    values($1,'gelato','paper','paper') returning id`, [session])
  const { id: quote } = await one(`insert into provider_quotes(candidate_id,country,currency,manufacturing_minor,shipping_minor,expires_at,options,created_by)
    values($1,'MX','MXN',100,100,now()+interval '15 minutes',
      jsonb_build_object('quantity',1,'attributes','{}'::jsonb,'methods','[{"method":"standard","shippingMinor":100}]'::jsonb,
        'fulfillmentJobId',$3::text,'destinationVersion',catalog_fulfillment_quote_context($3::uuid)->>'destinationVersion'),$2)
        returning id`, [candidate, actor, job])
  await one("select approve_catalog_fulfillment($1,$2,$3,'standard')", [actor, job, quote])
  await one("update provider_quotes set quoted_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where id=$1", [quote])
  await assert.rejects(one('select claim_catalog_fulfillment($1,$2)', [actor, job]), /quote_expired_or_mismatched/)
  await one("update provider_quotes set expires_at=now()+interval '15 minutes' where id=$1", [quote])
  await one(`update orders set shipping_address='{"country":"MX","city":"Changed"}' where id=$1`, [order])
  await assert.rejects(one('select claim_catalog_fulfillment($1,$2)', [actor, job]), /quote_expired_or_mismatched/)
  await one(`update orders set shipping_address='{"country":"MX"}' where id=$1`, [order])
  const { data } = await one('select claim_catalog_fulfillment($1,$2) as data', [actor, job])
  assert.equal(data.storagePath, 'prepared.jpg')
  assert.equal(data.quoteCurrency, 'MXN')
  await assert.rejects(one('select claim_catalog_fulfillment($1,$2)', [actor, job]), /fulfillment_already_claimed/)
})

test('price approval blocks overlapping active prices in the same book', async () => {
  const { id: variant } = await one("select id from product_variants where sku='NEW-A3'")
  const { id: book } = await one("select id from price_books where code='mx-mxn'")
  await assert.rejects(one('select activate_catalog_price_book($1,$2)', [actor, book]), /price_book_has_no_approved_entries/)
  const insert = amount => one('insert into price_book_entries(price_book_id,product_variant_id,amount_minor) values($1,$2,$3) returning id',
    [book, variant, amount])
  const first = await insert(1200)
  const overlap = await insert(1300)
  await one('select approve_catalog_price($1,$2)', [actor, first.id])
  await assert.rejects(one('select approve_catalog_price($1,$2)', [actor, overlap.id]), /overlapping_price_entry/)
  await one('select activate_catalog_price_book($1,$2)', [actor, book])
  assert.equal((await one('select status from price_books where id=$1', [book])).status, 'active')
})

test('wall art saves several drafts atomically with mockups and market prices', async () => {
  await db.query('update artworks set primary_image_url=$2 where id=$1', [art,'/mar.webp'])
  const { id: book } = await one("select id from price_books where code='mx-mxn'")
  const { id: session } = await one(`insert into product_discovery_sessions(artwork_id,created_by,criteria)
    values($1,$2,'{"workflow":"wall_art"}') returning id`, [art, actor])
  const candidates = []
  for (const uid of ['poster-a3', 'poster-a4', 'canvas-a3']) {
    await db.query("insert into provider_catalog_products(provider_code,external_id,title) values('gelato',$1,$1)", [uid])
    await db.query(`insert into provider_catalog_variants(provider_code,external_id,external_variant_id,external_sku,specification)
      values('gelato',$1,$1,$1,'{"widthMm":297,"heightMm":420}')`, [uid])
    candidates.push((await one(`insert into product_discovery_candidates(session_id,provider_code,external_id,external_variant_id)
      values($1,'gelato',$2,$2) returning id`, [session, uid])).id)
  }
  const variant = (candidateId, prices = []) => ({ candidateId, fit: 'contain', scenes: ['wall','gallery'],
    primaryScene: 'wall', prices })
  const products = [
    { titleEs:'Mar · Póster', family:'fine_art_print', variants:[variant(candidates[0],[{bookId:book,amountMinor:2000}]),variant(candidates[1])] },
    { titleEs:'Mar · Lienzo', family:'canvas', variants:[variant(candidates[2])] },
  ]
  const save = (payload, user = actor) => one('select save_wall_art_studio($1,$2,$3) ids', [user, session, JSON.stringify(payload)])
  await assert.rejects(save(products, art), /wall_art_session_invalid/)
  await assert.rejects(save([products[0], {...products[1], variants:[variant(art)]}]), /wall_art_candidate_invalid/)
  assert.equal((await one('select count(*)::int n from wall_art_mockups')).n, 0)
  const { ids } = await save(products)
  assert.equal(ids.length, 2)
  assert.deepEqual((await save(products)).ids, ids)
  const { rows } = await db.query(`select p.status,v.fulfillment_type,m.enabled,a.primary_scene,a.source_url
    from products p join product_variants v on v.product_id=p.id join provider_product_mappings m on m.product_variant_id=v.id
    join wall_art_mockups a on a.variant_id=v.id where p.id=any($1::uuid[])`, [ids])
  assert.equal(rows.length, 3)
  assert.ok(rows.every(row => row.status === 'draft' && row.fulfillment_type === 'provider'
    && row.enabled === false && row.primary_scene === 'wall' && row.source_url === '/mar.webp'))
  assert.equal((await one(`select count(*)::int n from price_book_entries e join product_variants v on v.id=e.product_variant_id
    where e.status='draft' and e.amount_minor=2000 and v.product_id=any($1::uuid[])`, [ids])).n, 1)
})

test('commerce gates publication and freezes an independent paid order without a certificate or supplier job', async () => {
  const { id: product } = await one("insert into products(sku,family_code,title_es,title_en,description_es,description_en) values ('C-P','canvas','Tela','Canvas','Edición bajo pedido','Made to order') returning id")
  await one("insert into artwork_products(artwork_id,product_id,relationship_type,is_primary) values($1,$2,'derived',true)",[art,product])
  const { id: variant } = await one("insert into product_variants(product_id,sku,fulfillment_type,inventory_policy,allowed_countries) values($1,'C-V','manual','made_to_order',array['MX']) returning id",[product])
  await one('select review_catalog_product($1,$2)',[actor,product])
  await one("select transition_fine_art_product($1,$2,'approve')",[actor,product])
  await assert.rejects(one("select transition_fine_art_product($1,$2,'publish',$3)",[actor,product,variant]),/publication_ineligible/)
  const { id: asset } = await one(`insert into art_assets(artwork_id,asset_type,visibility,storage_bucket,storage_path)
    values($1,'production_derivative','private','print-masters','commercial-ready.jpg') returning id`,[art])
  await one("insert into product_variant_assets(variant_id,asset_id,role) values($1,$2,'production')",[variant,asset])
  await one("insert into product_variant_attribute_values(variant_id,attribute_code,text_value) values($1,'size','A3')",[variant])
  await one("select add_fine_art_commercial_image($1,$2,'https://example.test/render.webp','Tela','Canvas','admin',true)",[actor,variant])
  const entry = await one(`insert into price_book_entries(price_book_id,product_variant_id,amount_minor)
    select id,$1,20000 from price_books where code='mx-mxn' returning id`,[variant])
  await one("select approve_catalog_price($1,$2)",[actor,entry.id])
  await one("select transition_fine_art_product($1,$2,'publish',$3)",[actor,product,variant])
  assert.equal((await one('select id from public_fine_art_variant_ids(array[$1]::uuid[],null)',[art])).id,variant)
  const snapshots = [{ artworkId:art,productId:product,variantId:variant,title:'Tela',sku:'C-V',amountMinor:20000,quantity:1,
    country:'MX',currency:'MXN',priceEntryId:entry.id,attributes:[{code:'size',value:'A3'}] }]
  const { id: checkout } = await one(`insert into fine_art_checkouts(buyer_id,country,currency,lines,stripe_session_id)
    values($1,'MX','MXN',$2,'cs_test_catalog') returning id`,[actor,JSON.stringify(snapshots)])
  await one("select transition_fine_art_product($1,$2,'unpublish',$3)",[actor,product,variant])
  assert.equal(await one('select id from public_fine_art_variant_ids(array[$1]::uuid[],null)',[art]),undefined)
  const fulfill = subtotal => one(`select fulfill_fine_art_checkout($1,'cs_test_catalog','pi_test_catalog','test@example.test',
    'Buyer',null,'{"country":"MX"}',200,'MXN',20000,null,$2) data`,[checkout,JSON.stringify({[variant]:{quantity:1,subtotal,currency:'mxn'}})])
  await assert.rejects(fulfill(100),/fine_art_amount_mismatch/)
  const { data: paid } = await fulfill(20000)
  assert.equal((await fulfill(20000)).data.orderId,paid.orderId)
  const line = await one('select * from order_items where order_id=$1',[paid.orderId])
  assert.equal(line.claim_token_snapshot,null)
  assert.equal(line.physical_edition_unit_id,null)
  assert.deepEqual(line.catalog_configuration_snapshot,snapshots[0])
  assert.equal((await one('select count(*)::int n from catalog_fulfillment_jobs where order_id=$1',[paid.orderId])).n,0)
  await assert.rejects(one("update order_items set catalog_configuration_snapshot='{}' where id=$1",[line.id]),/immutable_fine_art_snapshot/)
})

test('unified studio retains two Prodigi configurations as variants of one product and pins supplier options', async () => {
  const { id: session } = await one(`insert into product_discovery_sessions(artwork_id,created_by,criteria)
    values($1,$2,'{"providers":["prodigi"],"countries":["MX"]}') returning id`, [art,actor])
  await db.exec(`
    insert into provider_catalog_products(provider_code,external_id,title) values('prodigi','frame-parent','Framed Art');
    insert into provider_catalog_variants(provider_code,external_id,external_variant_id,external_sku,specification)
      values('prodigi','frame-parent','art-a3','A3-FRAME','{"widthMm":297,"heightMm":420}');
  `)
  const { id: candidate } = await one(`insert into product_discovery_candidates(session_id,provider_code,external_id,external_variant_id)
    values($1,'prodigi','frame-parent','art-a3') returning id`,[session])
  const variants = ['black','natural'].map(color=>({candidateId:candidate,configuration:{framecolour:color},
    attributes:{size:'A3',frame_color:color},fit:'contain',scenes:['gallery'],primaryScene:'gallery',prices:[]}))
  const { ids } = await one('select save_wall_art_studio($1,$2,$3) ids',[actor,session,JSON.stringify([
    { titleEs:'Obra enmarcada',family:'framed_print',variants },
  ])])
  assert.equal(ids.length,1)
  const { rows } = await db.query(`select m.provider_code,m.external_variant_id,m.external_configuration,m.enabled
    from provider_product_mappings m join product_variants v on v.id=m.product_variant_id
    where v.product_id=$1 order by m.external_configuration->>'framecolour'`,ids)
  assert.deepEqual(rows,variants.map(variant=>({provider_code:'prodigi',external_variant_id:'art-a3',
    external_configuration:variant.configuration,enabled:false})))
})

const rpcDb={async rpc(name,params) {
  try {
    const keys=Object.keys(params)
    const values=Object.values(params).map(value=>value && typeof value==='object' ? JSON.stringify(value) : value)
    return {data:(await one(`select ${name}(${keys.map((key,i)=>`${key}=>$${i+1}`).join(',')}) as result`,values)).result}
  } catch(error) {return {error}}
}}
const syncProduct=(size,extra={})=>{
  const uid=`poster_product_pf_${size}_pt_cotton_ct_matte`
  return {externalId:uid,title:'Cotton poster',category:'posters',supportedCountries:['MX'],
    variants:[{externalVariantId:uid,sku:uid,attributes:{PaperType:'cotton'},...extra}]}
}
const rpc=async(name,params)=>{const {data,error}=await rpcDb.rpc(name,params);if(error)throw error;return data}
const startSync=provider=>rpc('start_supplier_catalog_sync',{_provider:provider,_retry:false})

test('persistent Gelato sync resumes across new worker instances and activates only after all pages',async()=>{
  const calls=[]
  const revision=await startSync('gelato')
  assert.equal(await startSync('gelato'),revision)
  const adapter=()=>({categories:async()=>[{id:'posters',title:'Posters'}],search:async({offset})=>{
    calls.push(offset)
    return {items:[syncProduct(offset ? '50x70-cm' : '30x40-cm')],nextOffset:offset ? null : 25}
  }})
  await advanceSupplierSync(rpcDb,'gelato',adapter)
  await advanceSupplierSync(rpcDb,'gelato',adapter)
  assert.equal((await one("select active_revision from supplier_catalog_state where provider_code='gelato'")).active_revision,null)
  assert.equal((await one('select checkpoint from supplier_catalog_runs where id=$1',[revision])).checkpoint.offset,25)
  const completed=await advanceSupplierSync(rpcDb,'gelato',adapter)
  assert.equal(completed.complete,true)
  assert.deepEqual(calls,[0,25])
  const state=await one("select * from supplier_catalog_state where provider_code='gelato'")
  assert.equal(state.active_revision,revision)
  const result=await rpc('browse_supplier_catalog',{_provider:'gelato',_country:'MX',_query:'cotton',_limit:12})
  assert.equal(result.total,1)
  assert.equal(result.groups[0].variant_count,2)
  assert.deepEqual(result.groups[0].metadata.sizes.sort(),['30x40-cm','50x70-cm'])
  assert.equal((await rpc('browse_supplier_catalog',{_provider:'gelato',_country:'US'})).total,0)
  assert.equal((await rpc('browse_supplier_catalog',{_provider:'gelato',_query:'%'})).total,0)
  assert.equal((await rpc('browse_supplier_catalog',{_provider:'gelato',_offset:12})).groups.length,0)
})

test('leases fence expired workers and a failed/empty sync keeps the last complete revision',async()=>{
  const previous=(await one("select active_revision from supplier_catalog_state where provider_code='gelato'")).active_revision
  const revision=await startSync('gelato')
  const token='20000000-0000-4000-8000-000000000001'
  assert.ok(await rpc('claim_supplier_catalog_batch',{_provider:'gelato',_token:token}))
  assert.equal(await rpc('claim_supplier_catalog_batch',{_provider:'gelato',_token:actor}),null)
  await assert.rejects(rpc('commit_supplier_catalog_batch',{_run:revision,_token:actor,_checkpoint:{},_entries:[]}),/lease_lost/)
  await one("update supplier_catalog_runs set lease_until=now()-interval '1 second' where id=$1",[revision])
  assert.ok(await rpc('claim_supplier_catalog_batch',{_provider:'gelato',_token:actor}))
  await assert.rejects(rpc('commit_supplier_catalog_batch',{_run:revision,_token:token,_checkpoint:{},_entries:[]}),/lease_lost/)
  await assert.rejects(rpc('commit_supplier_catalog_batch',{_run:revision,_token:actor,_checkpoint:{},_entries:[],_complete:true}),/supplier_catalog_empty/)
  await rpc('fail_supplier_catalog_batch',{_run:revision,_token:actor,_error:'invalid_provider_response',_delay:5,_terminal:true})
  assert.equal((await one('select status from supplier_catalog_runs where id=$1',[revision])).status,'failed')
  assert.equal((await one("select active_revision from supplier_catalog_state where provider_code='gelato'")).active_revision,previous)
  assert.equal(await rpc('start_supplier_catalog_sync',{_provider:'gelato',_retry:true}),revision)
  await advanceSupplierSync(rpcDb,'gelato',()=>{throw Object.assign(new Error(),{code:'provider_not_configured'})})
})

test('full replacement detects changes and removals without deleting supplier mappings or JBU prices',async()=>{
  const revision=await startSync('gelato')
  const before=await one('select count(*) as n from price_book_entries')
  const adapter=()=>({categories:async()=>[{id:'posters',title:'Posters'}],search:async()=>({items:[syncProduct('30x40-cm',{widthMm:301})],nextOffset:null})})
  await advanceSupplierSync(rpcDb,'gelato',adapter)
  await advanceSupplierSync(rpcDb,'gelato',adapter)
  const run=await one('select * from supplier_catalog_runs where id=$1',[revision])
  assert.equal(run.status,'complete')
  assert.deepEqual(run.stats,{groups:1,variants:1,added:0,updated:1,removed:1})
  assert.equal((await one("select catalog_status from provider_catalog_variants where external_id like '%50x70-cm%'" )).catalog_status,'unavailable')
  assert.equal((await one('select count(*) as n from price_book_entries')).n,before.n)
})

test('Prodigi sync persists parent and variant pagination, exact combinations and original SKU',async()=>{
  const revision=await startSync('prodigi')
  const searched=[];const inspected=[]
  const adapter=()=>({search:async({offset})=>{searched.push(offset);return {items:[{externalId:offset ? 'canvas-two' : 'canvas-one',title:'Canvas'}],total:offset ? 26 : 26,nextOffset:offset ? null : 25}},
    product:async(id,{offset})=>{inspected.push([id,offset]);return {externalId:id,title:'Canvas',category:'wall-art',total:id==='canvas-one' ? 26 : 1,
      variants:[{externalVariantId:id+'-'+offset,sku:'REAL-'+id+'-'+offset,attributes:{Material:'cotton'},
        combinations:[{attributes:{framecolour:'black',glaze:'clear'}}],options:{framecolour:['black'],glaze:['clear']}}],
      nextOffset:id==='canvas-one' && offset===0 ? 25 : null}}
  })
  for(let i=0;i<8;i++) {
    const result=await advanceSupplierSync(rpcDb,'prodigi',adapter)
    if(result.complete)break
    assert.equal(result.error,undefined)
  }
  assert.deepEqual(searched,[0,25])
  assert.deepEqual(inspected,[['canvas-one',0],['canvas-one',25],['canvas-two',0]])
  assert.equal((await one('select status from supplier_catalog_runs where id=$1',[revision])).status,'complete')
  const entries=(await db.query('select * from supplier_catalog_entries where revision=$1',[revision])).rows
  assert.equal(entries.length,3)
  assert.equal(entries[0].variant.sku.startsWith('REAL-'),true)
  assert.deepEqual(entries[0].variant.combinations,[{attributes:{framecolour:'black',glaze:'clear'}}])
})

test('supplier index and worker RPCs deny anonymous and authenticated direct access',async()=>{
  for(const role of ['anon','authenticated']) {
    for(const sql of ["select * from supplier_catalog_entries", "select start_supplier_catalog_sync('gelato')", "select browse_supplier_catalog()"]){
      await assert.rejects(db.exec(`set role ${role}; ${sql}`),/permission denied/)
      await db.exec('reset role')
    }
  }
  await db.exec("set role service_role; select browse_supplier_catalog(); reset role")
})

test('rate-limited batches persist Retry-After, retain the checkpoint and stop after five failed attempts',async()=>{
  const previous=(await one("select active_revision from supplier_catalog_state where provider_code='gelato'")).active_revision
  const revision=await startSync('gelato')
  await advanceSupplierSync(rpcDb,'gelato',()=>({categories:async()=>[{id:'posters',title:'Posters'}]}))
  const checkpoint=(await one('select checkpoint from supplier_catalog_runs where id=$1',[revision])).checkpoint
  const limited=()=>({search:async()=>{throw Object.assign(new Error(),{code:'provider_rate_limited',retryAfter:'120'})}})
  for(let i=0;i<5;i++) {
    await advanceSupplierSync(rpcDb,'gelato',limited)
    const run=await one('select * from supplier_catalog_runs where id=$1',[revision])
    assert.equal(run.status,i===4 ? 'failed' : 'retry')
    assert.equal(run.attempts,i+1)
    assert.deepEqual(run.checkpoint,checkpoint)
    assert.ok(Date.parse(run.next_attempt_at)-Date.now()>110000)
    await one('update supplier_catalog_runs set next_attempt_at=now() where id=$1',[revision])
  }
  assert.equal((await one("select active_revision from supplier_catalog_state where provider_code='gelato'")).active_revision,previous)
  assert.equal(await rpc('start_supplier_catalog_sync',{_provider:'gelato',_retry:true}),revision)
  const result=await advanceSupplierSync(rpcDb,'gelato',()=>({search:async()=>({items:[syncProduct('30x40-cm')],nextOffset:null})}))
  assert.equal(result.complete,true)
  assert.equal((await one('select pages from supplier_catalog_runs where id=$1',[revision])).pages,2)
})

test('saving a pinned candidate uses selected dimensions after the canonical supplier record changes',async()=>{
  const source=syncProduct('30x40-cm')
  const variant=normalizeSupplierEntries('gelato',source)[0].variant
  const {id:session}=await one(`insert into product_discovery_sessions(artwork_id,created_by,criteria)
    values($1,$2,'{"providers":["gelato"],"countries":["MX"]}') returning id`,[art,actor])
  const {id:candidate}=await one(`insert into product_discovery_candidates(session_id,provider_code,external_id,external_variant_id,catalog_snapshot)
    values($1,'gelato',$2,$2,$3) returning id`,[session,source.externalId,JSON.stringify({variant})])
  await one(`update provider_catalog_variants set specification=jsonb_set(specification,'{widthMm}','999') where provider_code='gelato' and external_id=$1`,[source.externalId])
  const {saved}=await one('select save_wall_art_studio($1,$2,$3) saved',[actor,session,JSON.stringify([{family:'fine_art_print',titleEs:'Pinned',
    variants:[{candidateId:candidate,attributes:{size:'30x40-cm'},fit:'contain',scenes:['gallery'],primaryScene:'gallery',prices:[]}]}])])
  const mockup=await one('select m.width_mm from wall_art_mockups m join product_variants v on v.id=m.variant_id where v.product_id=$1',[saved[0]])
  assert.equal(Number(mockup.width_mm),300)
})

test('scheduled worker is opt-in, starts only one due revision and advances it after the browser closes',async()=>{
  const dbWithStates={...rpcDb,from:()=>({select:()=>({order:async()=>({data:(await db.query('select * from supplier_catalog_state order by provider_code')).rows})})})}
  const before=Number((await one('select count(*) n from supplier_catalog_runs')).n)
  const adapter=name=>{
    assert.equal(name,'gelato')
    return {categories:async()=>[{id:'posters',title:'Posters'}],search:async()=>({items:[syncProduct('30x40-cm')],nextOffset:null})}
  }
  await scheduledSupplierSync(dbWithStates,adapter)
  assert.equal(Number((await one('select count(*) n from supplier_catalog_runs')).n),before)
  await one("update supplier_catalog_state set schedule_enabled=true,next_refresh_at=now()-interval '1 hour' where provider_code='gelato'")
  await scheduledSupplierSync(dbWithStates,adapter)
  assert.equal(Number((await one('select count(*) n from supplier_catalog_runs')).n),before+1)
  assert.ok(Date.parse((await one("select next_refresh_at from supplier_catalog_state where provider_code='gelato'")).next_refresh_at)>Date.now())
  await scheduledSupplierSync(dbWithStates,adapter)
  assert.equal(Number((await one('select count(*) n from supplier_catalog_runs')).n),before+1)
  const run=await one("select * from supplier_catalog_runs where provider_code='gelato' order by created_at desc limit 1")
  assert.equal(run.status,'complete')
})

test('catalog image approval is exact-provider, exact-source-URL scoped and revocable',async()=>{
  const active=(await one("select active_revision from supplier_catalog_state where provider_code='gelato'")).active_revision
  const url='https://supplier.example/licensed-photo.jpg'
  await one(`update supplier_catalog_groups set metadata=jsonb_set(metadata,'{images}',$2) where revision=$1`,[active,JSON.stringify([{url,permission:'unverified'}])])
  assert.equal((await rpc('browse_supplier_catalog',{_provider:'gelato'})).groups[0].metadata.image,null)
  await one(`insert into supplier_catalog_image_permissions(provider_code,image_url,permission_reference,verified_by) values('prodigi',$1,'Supplier grant',$2)`,[url,actor])
  assert.equal((await rpc('browse_supplier_catalog',{_provider:'gelato'})).groups[0].metadata.image,null)
  await one(`insert into supplier_catalog_image_permissions(provider_code,image_url,permission_reference,verified_by) values('gelato',$1,'Written supplier grant',$2)`,[url,actor])
  assert.equal((await rpc('browse_supplier_catalog',{_provider:'gelato'})).groups[0].metadata.image.permission_reference,'Written supplier grant')
  await one("update supplier_catalog_image_permissions set enabled=false where provider_code='gelato'")
  assert.equal((await rpc('browse_supplier_catalog',{_provider:'gelato'})).groups[0].metadata.image,null)
})

test('legacy queued run with 490 committed batches respects next_attempt_at then resumes and activates without losing its rows',async()=>{
  const revision=await startSync('gelato')
  const seed=normalizeSupplierEntries('gelato',syncProduct('30x40-cm'))[0]
  const checkpoint={catalogs:['posters'],catalog:0,offset:12225,pending:[],nextSearch:12225}
  await rpc('claim_supplier_catalog_batch',{_provider:'gelato',_token:actor})
  await rpc('commit_supplier_catalog_batch',{_run:revision,_token:actor,_checkpoint:checkpoint,_entries:[seed]})
  // Fixture only: reproduce the reported legacy run. No production update/reset is part of this fix.
  await one("update supplier_catalog_runs set pages=490,errors=4,last_error='provider_unreachable',next_attempt_at=now()+interval '10 minutes' where id=$1",[revision])
  const before=await one('select * from supplier_catalog_runs where id=$1',[revision])
  const commercial=await one('select (select count(*) from products) products,(select count(*) from price_book_entries) prices,(select count(*) from provider_product_mappings) mappings')
  let requests=0
  const adapter=()=>({search:async({category,offset})=>{
    requests++;assert.equal(category,'posters');assert.equal(offset,12225)
    return {items:[syncProduct('50x70-cm')],nextOffset:null}
  }})
  assert.deepEqual(await advanceSupplierSync(rpcDb,'gelato',adapter),{idle:true})
  assert.equal(requests,0)
  const diagnostic=(await readFile(new URL('../../docs/sql/inspect-supplier-catalog-run.sql',import.meta.url),'utf8')).replace('44ab91a4-9973-4b5f-9ad6-9e604b42d33a',revision)
  const inspected=await one(diagnostic)
  assert.equal(inspected.eligible_for_worker,false)
  assert.equal(Number(inspected.unique_staged_variants),1)
  assert.equal(inspected.pages,490)
  const waiting=await one('select * from supplier_catalog_runs where id=$1',[revision])
  assert.equal(waiting.pages,490)
  assert.deepEqual(waiting.checkpoint,before.checkpoint)
  assert.equal(waiting.next_attempt_at.getTime(),before.next_attempt_at.getTime())
  assert.ok((await one("select last_worker_at from supplier_catalog_state where provider_code='gelato'")).last_worker_at)
  await one('update supplier_catalog_runs set next_attempt_at=now() where id=$1',[revision])
  const result=await advanceSupplierSync(rpcDb,'gelato',adapter)
  assert.equal(result.complete,true)
  assert.equal(result.revision,revision)
  const after=await one('select * from supplier_catalog_runs where id=$1',[revision])
  assert.equal(after.pages,491)
  assert.equal(after.errors,4)
  assert.equal(after.status,'complete')
  assert.ok(after.completed_at)
  assert.equal(after.checkpoint.lastProgress.offset,12225)
  assert.equal((await one("select active_revision from supplier_catalog_state where provider_code='gelato'")).active_revision,revision)
  assert.equal(Number((await one('select count(*) n from supplier_catalog_entries where revision=$1',[revision])).n),2)
  assert.deepEqual((await one('select variant from supplier_catalog_entries where revision=$1 and external_id=$2',[revision,seed.externalId])).variant,seed.variant)
  assert.deepEqual(await one('select (select count(*) from products) products,(select count(*) from price_book_entries) prices,(select count(*) from provider_product_mappings) mappings'),commercial)
})

test('an increasing offset with repeated source IDs stops before adding a false committed page or replacing a valid catalog',async()=>{
  const previous=(await one("select active_revision from supplier_catalog_state where provider_code='gelato'")).active_revision
  const revision=await startSync('gelato')
  await one('update supplier_catalog_runs set checkpoint=$2 where id=$1',[revision,JSON.stringify({catalogs:['posters'],catalog:0,offset:0,pending:[]})])
  const adapter=()=>({search:async({offset})=>({items:[syncProduct('30x40-cm')],nextOffset:offset+25})})
  await advanceSupplierSync(rpcDb,'gelato',adapter)
  const checkpoint=(await one('select checkpoint from supplier_catalog_runs where id=$1',[revision])).checkpoint
  const result=await advanceSupplierSync(rpcDb,'gelato',adapter)
  assert.equal(result.error,'supplier_pagination_repeated')
  const after=await one('select * from supplier_catalog_runs where id=$1',[revision])
  assert.equal(after.status,'failed')
  assert.equal(after.pages,1)
  assert.deepEqual(after.checkpoint,checkpoint)
  assert.equal(Number((await one('select count(*) n from supplier_catalog_entries where revision=$1',[revision])).n),1)
  assert.equal((await one("select active_revision from supplier_catalog_state where provider_code='gelato'")).active_revision,previous)
})
