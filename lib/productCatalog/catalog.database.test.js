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
  '20261217_provider_native_metadata.sql',
  '20261218_product_studio_matrix_handoff.sql',
  '20261219_studio_print_publication.sql',
  '20261220_studio_print_border.sql',
  '20261221_studio_print_asset_reuse.sql',
  '20261222_studio_production_readiness.sql',
  '20261224_studio_variant_attributes.sql',
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
      status text,is_historical_version boolean,version_kind text,version_parent_id uuid references artworks,version_published_at timestamptz,allows_prints boolean,
      print_price_mxn numeric,base_price_mxn numeric,calculated_price_mxn numeric,allowed_shipping_countries text[],shipping_policy_ids uuid[]);
    create table artwork_prints(id uuid primary key,artwork_id uuid references artworks,
      title text,sku text,price numeric,is_active boolean default false,is_available boolean default true,size text,paper_type text,finish text,framing text,edition_type text,allowed_shipping_countries text[]);
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
    create table print_asset_generations(revision_id uuid,production_file_path text, artwork_id uuid, print_id uuid,
      size text, is_current boolean, production_status text, layout jsonb, effective_dpi int, generated_at timestamptz default now(), master_approved_at timestamptz, master_source_ref jsonb);
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
    { titleEs:'Mar · Póster', family:'fine_art_print', variants:[{...variant(candidates[0],[{bookId:book,amountMinor:2000}]),borderMm:15},variant(candidates[1])] },
    { titleEs:'Mar · Lienzo', family:'canvas', variants:[variant(candidates[2])] },
  ]
  const save = (payload, user = actor) => one('select save_wall_art_studio($1,$2,$3) ids', [user, session, JSON.stringify(payload)])
  await assert.rejects(save(products, art), /wall_art_session_invalid/)
  await assert.rejects(save([products[0], {...products[1], variants:[variant(art)]}]), /wall_art_candidate_invalid/)
  assert.equal((await one('select count(*)::int n from wall_art_mockups')).n, 0)
  const { ids } = await save(products)
  assert.equal(ids.length, 2)
  assert.deepEqual((await save(products)).ids, ids)
  const { rows } = await db.query(`select p.status,v.fulfillment_type,m.enabled,a.primary_scene,a.source_url,a.border_mm
    from products p join product_variants v on v.product_id=p.id join provider_product_mappings m on m.product_variant_id=v.id
    join wall_art_mockups a on a.variant_id=v.id where p.id=any($1::uuid[])`, [ids])
  assert.equal(rows.length, 3)
  assert.deepEqual(rows.map(row=>row.border_mm).sort((a,b)=>a-b),[0,0,15])
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
  await assert.rejects(one("select transition_fine_art_product($1,$2,'publish',$3)",[actor,product,variant]),/publication_requirements_missing/)
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
    if(name==='studio_print_master_resolution') return {data:(await db.query('select * from studio_print_master_resolution($1)',values)).rows}
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
    for(const sql of ["select * from supplier_catalog_entries", "select * from provider_metadata_cache", "select start_supplier_catalog_sync('gelato')", "select browse_supplier_catalog()"]){
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

// Small PostgREST-shaped adapter to exercise the real service against the migrated SQL database.
function nativeServiceDatabase() {
  const allowed=new Set(['provider_metadata_cache','product_discovery_sessions','provider_catalog_products','provider_catalog_variants','product_discovery_candidates','product_catalog_audit','art_assets','price_books','price_book_entries','products','product_variants','artwork_products','print_asset_generations','product_attributes','product_media','product_discovery_selections','wall_art_studio_saves','artworks'])
  return {...rpcDb,from(table){
    assert.ok(allowed.has(table),table)
    let columns='*',filters=[],contains=[],write=null,mode=null,options={},single=false
    const query={select(value='*'){columns=value;return query},eq(key,value){filters.push([key,[value]]);return query},in(key,values){filters.push([key,values]);return query},contains(key,value){contains.push([key,value]);return query},order(){return query},limit(){return query},
      upsert(value,opts={}){write=value;mode='upsert';options=opts;return query},insert(value){write=value;mode='insert';return query},
      maybeSingle(){single=true;return query},single(){single=true;return query},
      async then(resolve,reject){try {
        let rows
        if(write) {
          const entries=Object.entries(write)
          const keys=entries.map(([key])=>key)
          const values=entries.map(([,value])=>value && typeof value==='object' ? JSON.stringify(value) : value)
          let conflict=''
          if(mode==='upsert') {
            const pk=options.onConflict || ({provider_metadata_cache:'provider_code,cache_key',provider_catalog_products:'provider_code,external_id',provider_catalog_variants:'provider_code,external_id,external_variant_id'})[table]
            conflict=options.ignoreDuplicates ? ` on conflict(${pk}) do nothing` : ` on conflict(${pk}) do update set ${keys.map(key=>`${key}=excluded.${key}`).join(',')}`
          }
          rows=(await db.query(`insert into ${table}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')})${conflict} returning *`,values)).rows
        } else {
          const values=[]
          const clauses=filters.map(([key,entries])=>{const slots=entries.map(value=>{values.push(value);return '$'+values.length});return `${key} in (${slots.join(',')})`})
          for(const [key,value] of contains){values.push(value);clauses.push(`${key} @> $${values.length}::uuid[]`)}
          const where=clauses.join(' and ')
          rows=(await db.query(`select * from ${table}${where ? ' where '+where : ''}`,values)).rows
          if(table==='product_variants' && columns.includes('wall_art_mockups'))for(const row of rows) {
            row.product_variant_attribute_values=(await db.query('select * from product_variant_attribute_values where variant_id=$1',[row.id])).rows
            row.provider_product_mappings=(await db.query('select * from provider_product_mappings where product_variant_id=$1',[row.id])).rows
            row.price_book_entries=(await db.query('select * from price_book_entries where product_variant_id=$1',[row.id])).rows
            row.wall_art_mockups=await one('select * from wall_art_mockups where variant_id=$1',[row.id])
            row.product_variant_assets=(await db.query('select * from product_variant_assets where variant_id=$1',[row.id])).rows
          }
          if(table==='artwork_products')for(const row of rows)row.artworks=await one('select * from artworks where id=$1',[row.artwork_id])
          if(table==='product_attributes')for(const row of rows) {
            row.product_family_attributes=(await db.query('select * from product_family_attributes where attribute_code=$1',[row.code])).rows
            row.product_attribute_values=[]
          }
          if(table==='product_discovery_selections')for(const row of rows)row.product_discovery_candidates=await one('select * from product_discovery_candidates where id=$1',[row.candidate_id])
          if(table==='wall_art_studio_saves')for(const row of rows)row.product_discovery_sessions=await one('select * from product_discovery_sessions where id=$1',[row.session_id])
          if(table==='product_discovery_candidates' && columns.includes('product_discovery_selections'))for(const row of rows)row.product_discovery_selections=(await db.query('select * from product_discovery_selections where candidate_id=$1',[row.id])).rows
          if(table==='product_discovery_candidates' && columns.includes('provider_catalog_variants')) {
            for(const row of rows)row.provider_catalog_variants=await one(`select v.specification,jsonb_build_object('title',p.title,'category',p.category) provider_catalog_products
              from provider_catalog_variants v join provider_catalog_products p using(provider_code,external_id)
              where v.provider_code=$1 and v.external_id=$2 and v.external_variant_id=$3`,[row.provider_code,row.external_id,row.external_variant_id])
          }
        }
        return resolve({data:single ? rows[0] || null : rows})
      }catch(error){return reject ? reject(error) : resolve({error})}}
    }
    return query
  }}
}

test('provider-native exploration requires no active revision, creates no products, and saves only the explicitly selected SKU through the existing commerce RPC',async()=>{
  const {catalogService}=await import('./service.js')
  const {gelatoAdapter}=await import('./providers.js')
  const {nativeGelatoFetch,nativeProducts}=await import('../../tests/fixtures/nativeProviderCatalog.js')
  const service=catalogService(nativeServiceDatabase(),actor,()=>gelatoAdapter('fixture-key',nativeGelatoFetch()))
  const {id:session}=await one(`insert into product_discovery_sessions(artwork_id,created_by,criteria)
    values($1,$2,'{"workflow":"wall_art","providers":["gelato"],"countries":["MX"]}') returning id`,[art,actor])
  const counts=()=>one('select (select count(*) from products) products,(select count(*) from provider_catalog_variants) supplier_variants,(select count(*) from supplier_catalog_runs) runs')
  const before=await counts()
  await service.nativeDiscover({provider:'gelato'})
  const input={provider:'gelato',catalogId:'framed-posters',presentationId:'jbu:framed_print:framed-posters',country:'MX',selection:{PaperFormat:'A2',FrameColor:'black'}}
  await service.nativeConfigure(input)
  assert.deepEqual(await counts(),before)
  const candidate=await service.addNativeCandidate({...input,sessionId:session,externalId:nativeProducts[0].productUid,variantId:nativeProducts[0].productUid})
  assert.equal(candidate.catalog_snapshot.mode,'native_v1')
  assert.equal(candidate.catalog_snapshot.presentation.id,input.presentationId)
  assert.equal(candidate.catalog_snapshot.presentation.version,1)
  assert.equal((await counts()).products,before.products)
  assert.equal(Number((await counts()).supplier_variants),Number(before.supplier_variants)+1)
  const saved=await service.saveWallArtDrafts({sessionId:session,products:[{group:'framed_print',titleEs:'Urban Totem · marco',
    variants:[{candidateId:candidate.id,configuration:{},fit:'contain',scenes:['gallery'],primaryScene:'gallery',prices:[]}]}]})
  const product=await one('select * from products where id=$1',[saved[0]])
  assert.equal(product.status,'draft')
  const mapping=await one('select m.* from provider_product_mappings m join product_variants v on v.id=m.product_variant_id where v.product_id=$1',[saved[0]])
  assert.equal(mapping.external_variant_id,nativeProducts[0].productUid)
  assert.equal(mapping.enabled,false)
  assert.equal((await counts()).runs,before.runs)
  const {id:secondSession}=await one(`insert into product_discovery_sessions(artwork_id,created_by,criteria) values($1,$2,'{"workflow":"wall_art","providers":["gelato"],"countries":["MX"]}') returning id`,[art,actor])
  await one("update provider_catalog_variants set specification='{\"historical\":true}' where provider_code='gelato' and external_id=$1",[nativeProducts[0].productUid])
  const pinned=await service.addNativeCandidate({...input,sessionId:secondSession,externalId:nativeProducts[0].productUid,variantId:nativeProducts[0].productUid})
  assert.equal(pinned.catalog_snapshot.variant.widthMm,420)
  assert.deepEqual((await one("select specification from provider_catalog_variants where provider_code='gelato' and external_id=$1",[nativeProducts[0].productUid])).specification,{historical:true})
  const {id:gbBook}=await one("insert into price_books(code,name,country,currency) values('native-gb','GB','GB','GBP') returning id")
  await assert.rejects(service.saveWallArtDrafts({sessionId:secondSession,products:[{group:'framed_print',titleEs:'Market test',variants:[{candidateId:pinned.id,configuration:{},fit:'contain',scenes:['gallery'],primaryScene:'gallery',prices:[{bookId:gbBook,amountMinor:2000}]}]}]}),{code:'provider_variant_unavailable'})
  assert.equal((await one('select width_mm from wall_art_mockups m join product_variants v on v.id=m.variant_id where v.product_id=$1',[saved[0]])).width_mm,'420')
  await assert.rejects(service.addNativeCandidate({...input,country:'US',sessionId:session,externalId:nativeProducts[0].productUid,variantId:nativeProducts[0].productUid}),{code:'provider_not_in_session'})
})

test('Industrial Pulse contract simulation saves a verified commercial poster, rejects observed cards, preserves exact mapping and paper metadata',async()=>{
  const {catalogService}=await import('./service.js')
  const {gelatoAdapter}=await import('./providers.js')
  const {observedPostersFetch,observedPostersResponse,simulatedPosters}=await import('../../tests/fixtures/gelatoPostersObserved.js')
  // This test changes supplier fixtures; expire only their shared test catalog-list cache.
  await db.exec("update provider_metadata_cache set expires_at=now()-interval '1 second' where provider_code='gelato' and cache_key='v1:catalogs'")
  const service=catalogService(nativeServiceDatabase(),actor,()=>gelatoAdapter('fixture-key',observedPostersFetch()))
  const {id:sessionId}=await one(`insert into product_discovery_sessions(artwork_id,created_by,criteria) values($1,$2,'{"workflow":"wall_art","providers":["gelato"],"countries":["MX"]}') returning id`,[art,actor])
  const before=await one('select count(*)::int n from products')
  const discovery=await service.nativeDiscover({provider:'gelato',category:'posters',country:'MX'})
  assert.equal((await one('select count(*)::int n from products')).n,before.n)
  const card=discovery.presentations.find(row=>row.id==='jbu:poster:200gsm-uncoated')
  const input={provider:'gelato',catalogId:'posters',presentationId:card.id,country:'MX',selection:{PaperFormat:'A2'}}
  const candidate=await service.addNativeCandidate({...input,sessionId,externalId:simulatedPosters[0].productUid,variantId:simulatedPosters[0].productUid})
  assert.equal(candidate.catalog_snapshot.presentation.materialSummary[0],card.materialSummary[0])
  assert.equal(candidate.catalog_snapshot.groupKey,card.id)
  const bad=observedPostersResponse.candidates[0].externalId
  await assert.rejects(service.addNativeCandidate({...input,sessionId,selection:{},externalId:bad,variantId:bad}),{code:'native_configuration_changed'})
  assert.equal((await one('select count(*)::int n from product_discovery_candidates where session_id=$1',[sessionId])).n,1)
  const saved=await service.saveWallArtDrafts({sessionId,products:[{group:'poster',titleEs:'Industrial Pulse · póster 200 g/m²',variants:[{candidateId:candidate.id,configuration:{},fit:'contain',scenes:['gallery'],primaryScene:'gallery',prices:[]}]}]})
  const result=await one('select p.status,m.external_id,m.external_variant_id,m.enabled from products p join product_variants v on v.product_id=p.id join provider_product_mappings m on m.product_variant_id=v.id where p.id=$1',[saved[0]])
  assert.equal(result.status,'draft')
  assert.equal(result.external_id,simulatedPosters[0].productUid)
  assert.equal(result.external_variant_id,simulatedPosters[0].productUid)
  assert.equal(result.enabled,false)
  assert.equal((await one("select a.text_value from product_variant_attribute_values a join product_variants v on v.id=a.variant_id where v.product_id=$1 and a.attribute_code='paper'",[saved[0]])).text_value,'200-gsm-uncoated')

})

test('one artwork-version draft contains exactly three selected configurations, exact mappings and source provenance, and retries create no duplicates',async()=>{
  const {catalogService}=await import('./service.js')
  const {gelatoAdapter}=await import('./providers.js')
  const {matrixProviderFetch,matrixProducts}=await import('../../tests/fixtures/matrixProviderCatalog.js')
  const {id:version}=await one(`insert into artworks(id,title,sku,status,allows_prints,primary_image_url,version_parent_id,version_kind,is_historical_version)
    values(gen_random_uuid(),'Industrial Pulse version fixture','PULSE-V-FIXTURE','AVAILABLE',true,'https://example.test/pulse-version.jpg',$1,'SNAPSHOT',true) returning id`,[art])
  const {id:asset}=await one(`insert into art_assets(artwork_id,asset_type,visibility,storage_bucket,storage_path,width_px,height_px) values($1,'production_derivative','private','print-masters','pulse-version-fixture.jpg',3000,6000) returning id`,[version])
  const service=catalogService(nativeServiceDatabase(),actor,()=>gelatoAdapter('fixture-key',matrixProviderFetch()))
  const {id:sessionId}=await service.createSession({artworkId:version,sourceAssetId:asset,workflow:'wall_art',providers:['gelato'],countries:['MX']})
  // The preview chosen at session creation must survive a later primary-photo change.
  await one('update artworks set primary_image_url=$1 where id=$2',['https://example.test/later-photo.jpg',version])
  const input={provider:'gelato',catalogId:'posters',presentationId:'jbu:poster:200gsm-uncoated',country:'MX',selection:{}}
  const candidates=[]
  for(const [index,row] of matrixProducts.entries())candidates.push(await service.addNativeCandidate({...input,sessionId,offset:index===2?2:0,externalId:row.productUid,variantId:row.productUid}))
  const {id:matrixBook}=await one("insert into price_books(code,name,country,currency) values('matrix-fixture-mx','Matrix Mexico','MX','MXN') returning id")
  const products=[{group:'poster',titleEs:'Industrial Pulse · 200 gsm',variants:candidates.map((row,index)=>({candidateId:row.id,configuration:{},fit:'contain',scenes:['gallery'],primaryScene:'gallery',prices:index<2 ? [{bookId:matrixBook,amountMinor:10000+index*5000}] : []}))}]
  await assert.rejects(service.saveWallArtDrafts({sessionId,products:[{...products[0],variants:products[0].variants.slice(0,1)},{...products[0],variants:products[0].variants.slice(1)}]}),{code:'wall_art_selection_invalid'})
  const saved=await service.saveWallArtDrafts({sessionId,products})
  assert.equal(saved.length,1)
  assert.deepEqual(await service.saveWallArtDrafts({sessionId,products}),saved)
  assert.equal((await one('select count(*)::int n from product_variants where product_id=$1',[saved[0]])).n,3)
  assert.equal((await one('select artwork_id from artwork_products where product_id=$1',[saved[0]])).artwork_id,version)
  const detail=await service.productDetails({productId:saved[0]})
  assert.equal(detail.artworks[0].artworks.id,version)
  assert.equal(detail.originals[0].id,art)
  assert.equal(detail.studioSaves[0].product_discovery_sessions.source_asset_id,asset)
  assert.equal(detail.selections.length,3)
  assert.deepEqual(detail.handoffIssues,[])
  assert.equal(detail.variants.every(row=>row.provider_product_mappings[0].production_asset_id===asset && !row.provider_product_mappings[0].enabled),true)
  assert.deepEqual(detail.variants.map(row=>row.provider_product_mappings[0].external_variant_id).sort(),matrixProducts.map(row=>row.productUid).sort())
  assert.equal(detail.variants.every(row=>row.wall_art_mockups.source_url==='https://example.test/pulse-version.jpg'),true)
  assert.equal(detail.product.status,'draft')
  await assert.rejects(service.setVariantAttribute({variantId:detail.variants[0].id,attribute:'size',value:'Unverified override'}),{code:'configured_variant_attribute_locked'})
  assert.ok(detail.variants.every(row=>row.allowed_countries.includes('MX')))
  assert.equal((await one("select count(*)::int n from product_variant_assets a join product_variants v on v.id=a.variant_id where v.product_id=$1 and a.role='production' and a.asset_id=$2",[saved[0],asset])).n,3)
  assert.equal(Object.keys(detail.readiness).length,3)
  assert.deepEqual(detail.variants.flatMap(row=>row.price_book_entries).map(row=>Number(row.amount_minor)).sort((a,b)=>a-b),[10000,15000])
  assert.ok(detail.variants.flatMap(row=>row.price_book_entries).every(row=>row.status==='draft'))
  assert.equal((await one('select status from price_books where id=$1',[matrixBook])).status,'draft')
})

test('final draft creation rechecks selected supplier configuration and writes no products when source attributes changed',async()=>{
  const {catalogService}=await import('./service.js')
  const {gelatoAdapter}=await import('./providers.js')
  const {matrixProviderFetch,matrixProducts}=await import('../../tests/fixtures/matrixProviderCatalog.js')
  let changed=false
  const fetcher=matrixProviderFetch()
  const service=catalogService(nativeServiceDatabase(),actor,()=>gelatoAdapter('fixture-key',async(url,options)=>{
    const response=await fetcher(url,options)
    if(changed && url.includes('/products/') && !options.body) {
      const row=await response.json();return Response.json({...row,attributes:{...row.attributes,PaperType:'170-gsm-coated-silk'}})
    }
    return response
  }))
  const {id:sessionId}=await one(`insert into product_discovery_sessions(artwork_id,created_by,criteria) values($1,$2,'{"workflow":"wall_art","providers":["gelato"],"countries":["MX"]}') returning id`,[art,actor])
  const row=matrixProducts[0]
  const candidate=await service.addNativeCandidate({sessionId,provider:'gelato',catalogId:'posters',presentationId:'jbu:poster:200gsm-uncoated',country:'MX',selection:{},externalId:row.productUid,variantId:row.productUid})
  const before=await one('select count(*)::int n from products')
  changed=true
  await assert.rejects(service.saveWallArtDrafts({sessionId,products:[{group:'poster',titleEs:'Must not create changed stock',variants:[{candidateId:candidate.id,configuration:{},fit:'contain',scenes:['gallery'],primaryScene:'gallery',prices:[]}]}]}),{code:'native_configuration_changed'})
  assert.equal((await one('select count(*)::int n from products')).n,before.n)
  assert.equal((await one('select count(*)::int n from wall_art_studio_saves where session_id=$1',[sessionId])).n,0)
})

test('refresh can update only an uncommitted native snapshot, preserves canonical rows and fences stale draft writes',async()=>{
  const {catalogService}=await import('./service.js')
  const {gelatoAdapter}=await import('./providers.js')
  const {matrixProviderFetch,matrixProducts}=await import('../../tests/fixtures/matrixProviderCatalog.js')
  const fetcher=matrixProviderFetch();let changed=false
  const service=catalogService(nativeServiceDatabase(),actor,()=>gelatoAdapter('fixture-key',async(url,options)=>{
    const response=await fetcher(url,options)
    if(changed && url.includes('/products/') && !options.body) {
      const data=await response.json();return Response.json({...data,dimensions:{...data.dimensions,Width:{value:421,measureUnit:'mm'}}})
    }
    return response
  }))
  const {id:sessionId}=await service.createSession({artworkId:art,workflow:'wall_art',providers:['gelato'],countries:['MX']})
  const uid=matrixProducts[0].productUid
  const input={sessionId,provider:'gelato',catalogId:'posters',presentationId:'jbu:poster:200gsm-uncoated',country:'MX',selection:{},externalId:uid,variantId:uid}
  const old=await service.addNativeCandidate(input)
  const canonical=(await one("select specification from provider_catalog_variants where provider_code='gelato' and external_variant_id=$1",[uid])).specification
  changed=true
  const fresh=await service.addNativeCandidate(input)
  assert.equal(fresh.id,old.id)
  assert.equal(fresh.catalog_snapshot.variant.widthMm,421)
  assert.deepEqual((await one("select specification from provider_catalog_variants where provider_code='gelato' and external_variant_id=$1",[uid])).specification,canonical)
  const variants=[{candidateId:old.id,configuration:{},fit:'contain',scenes:['gallery'],primaryScene:'gallery',prices:[],sourceSnapshot:old.catalog_snapshot}]
  await assert.rejects(rpc('save_wall_art_studio',{_actor:actor,_session:sessionId,_products:[{family:'fine_art_print',titleEs:'Stale must roll back',variants}]}),/candidate_revision_changed/)
  assert.equal((await one('select count(*)::int n from wall_art_studio_saves where session_id=$1',[sessionId])).n,0)
  await service.saveWallArtDrafts({sessionId,products:[{group:'poster',titleEs:'Refreshed source',variants}]})
  await assert.rejects(rpc('refresh_studio_candidate',{_actor:actor,_candidate:fresh.id,_snapshot:old.catalog_snapshot,_compatibility:{}}),/wall_art_session_invalid/)
  await assert.rejects(db.exec(`set role anon; select refresh_studio_candidate('${actor}','${fresh.id}','{}','{}')`),/permission denied/)
  await db.exec('reset role')
})

test('Prodigi reported combinations sharing a source variant become distinct selected JBU variants of one draft',async()=>{
  const {catalogService}=await import('./service.js')
  const {prodigiAdapter}=await import('./providers.js')
  const parent={id:'matrix-framed-parent',name:'Framed art',category:'wall-art/framed-prints',attributes:{framecolour:['black','white'],glaze:['clear'],mountdepth:['deep','shallow']}}
  const variant={id:'PRODIGI-EXACT-FIXTURE',sku:'PRODIGI-EXACT-FIXTURE',attributeOptions:parent.attributes,combinations:[{attributes:{framecolour:'black',glaze:'clear',mountdepth:'deep'}},{attributes:{framecolour:'white',glaze:'clear',mountdepth:'shallow'}}]}
  const service=catalogService(nativeServiceDatabase(),actor,()=>prodigiAdapter('fixture-key',async url=>Response.json(url.includes('/variants?') ? {data:[variant],total:1} : {data:parent})))
  const {id:sessionId}=await service.createSession({artworkId:art,workflow:'wall_art',providers:['prodigi'],countries:['MX']})
  const rows=[]
  for(const combo of variant.combinations)rows.push(await service.addNativeCandidate({sessionId,provider:'prodigi',catalogId:parent.id,presentationId:'jbu:framed_print:matrix-framed-parent',country:'MX',externalId:parent.id,variantId:variant.id,selection:{},configuration:combo.attributes}))
  assert.equal(rows[0].id,rows[1].id,'The existing candidate identity is reused; exact option selection identifies configurations')
  const resumed=await service.resumeSession({sessionId})
  assert.equal(resumed.candidates.length,1)
  assert.equal(resumed.session.criteria.matrixSelections.length,2)
  await service.removeStudioSelection({sessionId,candidateId:rows[0].id,configuration:variant.combinations[0].attributes})
  assert.equal((await service.resumeSession({sessionId})).session.criteria.matrixSelections.length,1)
  await service.addNativeCandidate({sessionId,provider:'prodigi',catalogId:parent.id,presentationId:'jbu:framed_print:matrix-framed-parent',country:'MX',externalId:parent.id,variantId:variant.id,selection:{},configuration:variant.combinations[0].attributes})
  assert.equal((await service.resumeSession({sessionId})).session.criteria.matrixSelections.length,2)
  const saved=await service.saveWallArtDrafts({sessionId,products:[{group:'framed_print',titleEs:'Prodigi configurations',variants:rows.map((row,index)=>({candidateId:row.id,configuration:variant.combinations[index].attributes,fit:'contain',scenes:['gallery'],primaryScene:'gallery',prices:[]}))}]})
  assert.equal(saved.length,1)
  const mappings=(await db.query('select m.external_variant_id,m.external_configuration from provider_product_mappings m join product_variants v on v.id=m.product_variant_id where v.product_id=$1',[saved[0]])).rows
  assert.equal(mappings.length,2)
  assert.ok(mappings.every(row=>row.external_variant_id===variant.id))
  assert.deepEqual(mappings.map(row=>row.external_configuration.framecolour).sort(),['black','white'])
  const stored=(await db.query(`select av.text_value from product_variant_attribute_values av
    join product_variants v on v.id=av.variant_id where v.product_id=$1 and av.attribute_code='mountdepth' order by av.text_value`,saved)).rows
  assert.deepEqual(stored,[{text_value:'deep'},{text_value:'shallow'}])

})

test('Industrial Pulse historical satin poster publishes one of six variants for Mexico', async () => {
  const { catalogService } = await import('./service.js')
  const { id: version } = await one(`insert into artworks(id,title,sku,status,allows_prints,primary_image_url,version_parent_id,version_kind,is_historical_version)
    values(gen_random_uuid(),'Industrial Pulse · versión anterior','PULSE-HIST-TEST','AVAILABLE',true,'/pulse-historical.webp',$1,'SNAPSHOT',true) returning id`,[art])
  const { id: session } = await one(`insert into product_discovery_sessions(artwork_id,created_by,criteria)
    values($1,$2,'{"workflow":"wall_art","countries":["MX"],"providers":["gelato"]}') returning id`,[version,actor])
  const variants = []
  for (const [size,width,height] of [['A2',420,594],['A1',594,841],['A3',297,420],['A4',210,297],['A5',148,210],['A6',105,148]]) {
    const sku = 'pulse-test-200gsm-satin-'+size
    const spec = { sku, widthMm:width, heightMm:height }
    await one("insert into provider_catalog_products(provider_code,external_id,title) values('gelato',$1,'200 g/m² coated silk')",[sku])
    await one(`insert into provider_catalog_variants(provider_code,external_id,external_variant_id,external_sku,specification)
      values('gelato',$1,$1,$1,$2)`,[sku,JSON.stringify(spec)])
    const { id: candidateId } = await one(`insert into product_discovery_candidates(session_id,provider_code,external_id,external_variant_id,catalog_snapshot)
      values($1,'gelato',$2,$2,$3) returning id`,[session,sku,JSON.stringify({variant:spec})])
    variants.push({candidateId,attributes:{size,finish:'Satin'},fit:'contain',scenes:['gallery'],primaryScene:'gallery',prices:[]})
  }
  const register = async (artwork, size, path, width, height) => {
    const row = await one(`insert into artwork_prints(id,artwork_id,size,edition_type)
      values(gen_random_uuid(),$1,$2,'OPEN') returning id`,[artwork,size])
    await one(`insert into print_asset_generations(revision_id,production_file_path,artwork_id,print_id,size,is_current,production_status,layout,effective_dpi,master_approved_at)
      values(gen_random_uuid(),$1,$2,$3,$4,true,'MASTER_READY',$5,300,now())`,
    [path,artwork,row.id,size,JSON.stringify({paperWidthMm:width,paperHeightMm:height,width:Math.round(width/25.4*300),height:Math.round(height/25.4*300)})])
  }
  await register(art,'A2','current-a2.jpg',420,594)
  await register(version,'A2','historical-a2-landscape.jpg',594,420)

  const { ids:[product] } = await one('select save_wall_art_studio($1,$2,$3) ids',[actor,session,JSON.stringify([{
    family:'fine_art_print',titleEs:'Industrial Pulse · Póster 200 g/m² satinado',titleEn:'Industrial Pulse · 200 gsm silk poster',
    descriptionEs:'Póster satinado',descriptionEn:'Silk poster',variants,
  }])])
  const service = catalogService(nativeServiceDatabase(),actor)
  const detail = await service.productDetails({productId:product})
  const target = detail.variants.find(row=>row.provider_product_mappings[0].external_variant_id==='pulse-test-200gsm-satin-A2')
  const variantId=target.id
  assert.equal(detail.artworks[0].artworks.id,version)
  assert.equal(detail.variants.length,6)
  assert.ok(target.product_variant_attribute_values.some(attr=>attr.attribute_code==='finish' && attr.text_value==='Satin'))
  assert.deepEqual(detail.readiness[variantId],['image','production_asset','provider_mapping','price_mx'])
  await one('select review_catalog_product($1,$2)',[actor,product])
  await service.transitionPublication({productId:product,action:'approve'})

  const previousMigration = await migration('20261213_fine_art_commerce.sql')
  const previousTransition = previousMigration.slice(previousMigration.indexOf('create function public.transition_fine_art_product'),
    previousMigration.indexOf('create function public.add_fine_art_commercial_image'))
  await db.exec(previousTransition.replace('public.transition_fine_art_product','public.previous_studio_transition'))
  await assert.rejects(one("select previous_studio_transition($1,$2,'publish',$3)",[actor,product,variantId]),/publication_ineligible/)
  await db.exec('drop function public.previous_studio_transition(uuid,uuid,text,uuid)')
  await assert.rejects(service.transitionPublication({productId:product,variantId,action:'publish'}), error => {
    assert.equal(error.message,'publication_requirements_missing')
    assert.deepEqual(JSON.parse(error.detail),detail.readiness[variantId])
    return true
  })

  // A file becomes available after the draft was saved. Opening the draft links it.
  await register(version,'A2','historical-a2-portrait.jpg',420,594)
  const reopened = await service.productDetails({productId:product})
  assert.deepEqual(reopened.readiness[variantId],['image','provider_mapping','price_mx'])
  const mapping = await one(`select m.id,m.production_asset_id,a.storage_path
    from provider_product_mappings m join art_assets a on a.id=m.production_asset_id
    where m.product_variant_id=$1`,[variantId])
  assert.equal(mapping.storage_path,'historical-a2-portrait.jpg')
  await one("select enable_catalog_provider_mapping($1,$2,$3,array['MX'])",[actor,mapping.id,mapping.production_asset_id])
  await db.exec("update fulfillment_providers set enabled=true where code='gelato'")
  await one("select add_fine_art_commercial_image($1,$2,'https://example.test/pulse-satin.webp','Póster','Poster','admin',true)",[actor,variantId])
  assert.deepEqual(await service.publicationStatus({variantId}),['price_mx'])
  const entry = await service.addPriceDraft({
    bookId:(await one("select id from price_books where code='mx-mxn'")).id,variantId,amountMinor:20000,
  })
  await one('select approve_catalog_price($1,$2)',[actor,entry.id])
  assert.deepEqual(await service.publicationStatus({variantId}),[])
  await service.transitionPublication({productId:product,variantId,action:'publish'})
  // The SQL source used by /prints returns just this variant for this artwork version.
  assert.deepEqual((await db.query('select id from public_fine_art_variant_ids(array[$1]::uuid[],null)',[version])).rows,[{id:variantId}])
  assert.equal(await one('select id from public_fine_art_variant_ids(array[$1]::uuid[],array[$2]::uuid[])',[art,variantId]),undefined)
  assert.deepEqual((await one('select fine_art_priced_countries($1) countries',[variantId])).countries,['MX'])
  assert.equal((await one("select count(*)::int n from product_variants where product_id=$1 and status='draft'",[product])).n,5)
  assert.equal((await one('select price from artwork_prints where id=$1',[print])).price,'400')
})

test('Studio reuses inactive unpriced A1 and A2 masters across presentations', async () => {
  const { catalogService } = await import('./service.js')
  const { id: artwork } = await one(`insert into artworks(id,title,sku,primary_image_url)
    values(gen_random_uuid(),'La Silla del Cantor','JBU-034','/cantor.webp') returning id`)
  const save = async (size, suffix, widthMm, heightMm, printAreas = [], borderMm = 0, sourceAsset = null) => {
    const { id: session } = await one(`insert into product_discovery_sessions(artwork_id,created_by,criteria,source_asset_id)
      values($1,$2,'{"workflow":"wall_art","countries":["MX"],"providers":["gelato"]}',$3) returning id`, [artwork,actor,sourceAsset])
    const sku = 'cantor-' + size + '-' + suffix
    await one("insert into provider_catalog_products(provider_code,external_id,title) values('gelato',$1,$1)", [sku])
    await one(`insert into provider_catalog_variants(provider_code,external_id,external_variant_id,external_sku,specification)
      values('gelato',$1,$1,$1,$2)`, [sku,JSON.stringify({widthMm,heightMm,printAreas})])
    const { id: candidateId } = await one(`insert into product_discovery_candidates(session_id,provider_code,external_id,external_variant_id)
      values($1,'gelato',$2,$2) returning id`, [session,sku])
    const { ids:[productId] } = await one('select save_wall_art_studio($1,$2,$3) ids', [actor,session,JSON.stringify([{
      family:'fine_art_print',titleEs:sku,titleEn:sku,descriptionEs:sku,descriptionEn:sku,
      variants:[{candidateId,attributes:{size},fit:'contain',borderMm,scenes:['gallery'],primaryScene:'gallery',prices:[]}],
    }])])
    return { productId, ...(await one(`select m.id, m.product_variant_id variant_id, m.production_asset_id
      from provider_product_mappings m join product_variants v on m.product_variant_id=v.id where v.product_id=$1`, [productId])) }
  }
  const register = async (printId, size, width, height, path) => one(`insert into print_asset_generations
    (revision_id,production_file_path,artwork_id,print_id,size,is_current,production_status,layout,effective_dpi,master_approved_at)
    values(gen_random_uuid(),$1,$2,$3,$4,true,case when $1::text is null then 'PREVIEW_ONLY' else 'MASTER_READY' end,
      $5,250,case when $1::text is not null then now() end) returning revision_id`, [path,artwork,printId,size,JSON.stringify({
    width:width*10,height:height*10,paperWidthMm:width,paperHeightMm:height,
    marginsMm:{top:46.8,right:20.05,bottom:46.8,left:20.05},
  })])
  const before = []
  for (const [size,width,height] of [['A1',594,841],['A2',420,594]]) {
    const row = await one(`insert into artwork_prints(id,artwork_id,size,sku,edition_type)
      values(gen_random_uuid(),$1,$2,$3,'OPEN') returning *`, [artwork,size,size+'-original'])
    before.push(row)
    const master = await register(row.id,size,width,height,size+'.jpg')
    if (size==='A2') await one(`update print_asset_generations set master_approved_at=null,
      master_source_ref='{"effectiveDpi":260}' where revision_id=$1`, [master.revision_id])
    const first = await save(size,'first',width,height)
    assert.ok(first.production_asset_id)
    await one("select enable_catalog_provider_mapping($1,$2,$3,array['MX'])", [actor,first.id,first.production_asset_id])
    await one("update artwork_prints set size=size || ' · legacy dimensions' where id=$1", [row.id])
    before[before.length-1].size += ' · legacy dimensions'
    if (size==='A1') {
      await one('update print_asset_generations set is_current=false where revision_id=$1', [master.revision_id])
      await register(row.id,size,width,height,null)
    }
    const next = await save(size,'additional',width,height)
    assert.equal(next.production_asset_id,first.production_asset_id)
    assert.equal((await save(size,'embedded-border',width,height,[],20)).production_asset_id,first.production_asset_id)
    const supplierArea = await save(size,'supplier-area',width,height,[{required:true,widthMm:width+6,heightMm:height+6}])
    assert.equal((await one('select status from studio_print_master_resolution($1)',[supplierArea.variant_id])).status,'supplier_area_geometry')
    const derived = await save(size,'different-border',width,height,[],10)
    assert.equal(derived.production_asset_id,null)
    assert.equal((await one('select status from studio_print_master_resolution($1)',[derived.variant_id])).status,'derived_border')

    const detail = await catalogService(nativeServiceDatabase(),actor).productDetails({productId:next.productId})
    assert.equal(detail.productionAssets[next.variant_id],'linked')
    assert.deepEqual(await one('select production_asset_id, enabled from provider_product_mappings where id=$1',[first.id]),
      { production_asset_id:first.production_asset_id,enabled:true })
    for (const [suffix,w,h,areas] of [['landscape',height,width,[]],['higher-dpi',width,height,[{required:true,recommendedDpi:300}]]]) {
      const incompatible = await save(size,suffix,w,h,areas,0,first.production_asset_id)
      assert.equal(incompatible.production_asset_id,null)
      assert.equal((await one('select status from studio_print_master_resolution($1)',[incompatible.variant_id])).status,suffix==='landscape' ? 'orientation' : 'resolution')
    }
  }
  const preview = await one(`insert into artwork_prints(id,artwork_id,size) values(gen_random_uuid(),$1,'A3') returning *`, [artwork])
  before.push(preview)
  await register(preview.id,'A3',297,420,null)
  for (const [size,w,h,status] of [['A3',297,420,'needs_validation'],['A0',841,1189,'missing']]) {
    const variant = await save(size,'pending',w,h)
    assert.equal(variant.production_asset_id,null)
    const detail = await catalogService(nativeServiceDatabase(),actor).productDetails({productId:variant.productId})
    assert.equal(detail.productionAssets[variant.variant_id],status)
  }
  const { rows } = await db.query('select * from artwork_prints where artwork_id=$1 order by size', [artwork])
  assert.deepEqual(rows,before)
})

test('wallArtCosts uses the submitted address and exact framed Gelato UID while preserving manufacturing', async()=>{
  const {catalogService}=await import('./service.js')
  const {gelatoAdapter}=await import('./providers.js')
  const {id:sessionId}=await one(`insert into product_discovery_sessions(artwork_id,created_by,criteria)
    values($1,$2,'{"workflow":"wall_art","countries":["MX"]}') returning id`,[art,actor])
  const uid='frame_and_poster_product_frs_a2_frc_black_frm_aluminum_fixture'
  await one("insert into provider_catalog_products(provider_code,external_id,title) values('gelato',$1,'Framed aluminum')",[uid])
  await one(`insert into provider_catalog_variants(provider_code,external_id,external_variant_id,external_sku,specification)
    values('gelato',$1,$1,$1,'{}')`,[uid])
  const {id:candidateId}=await one(`insert into product_discovery_candidates(session_id,provider_code,external_id,external_variant_id)
    values($1,'gelato',$2,$2) returning id`,[sessionId,uid])
  const destination={line1:'Fixture 123',line2:'Unit 2',city:'Monterrey',region:'NL',postalCode:'64000',
    firstName:'Test',lastName:'Recipient',email:'test@example.test'}
  let responseMode='valid',quoteCalls=0
  const service=catalogService(nativeServiceDatabase(),actor,()=>gelatoAdapter('fixture-key',async(url,request)=>{
    if(url.includes('/products/'))return Response.json([{productUid:uid,country:'MX',currency:'MXN',quantity:1,price:400}])
    assert.equal(url,'https://order.gelatoapis.com/v4/orders:quote')
    quoteCalls++
    const body=JSON.parse(request.body)
    assert.deepEqual(body.recipient,{country:'MX',addressLine1:destination.line1,addressLine2:destination.line2,
      city:destination.city,state:destination.region,postCode:destination.postalCode,
      firstName:destination.firstName,lastName:destination.lastName,email:destination.email})
    assert.equal(body.products[0].productUid,uid)
    if(responseMode==='network')throw new Error('private upstream diagnostic')
    if(responseMode==='noMethods')return Response.json({quotes:[]})
    if(responseMode!=='valid')return Response.json({code:responseMode,message:'private upstream diagnostic'},{status:400})
    return Response.json({quotes:[{products:[{...body.products[0],price:425,currency:'MXN'}],
      shipmentMethods:[{shipmentMethodUid:'standard',price:130,currency:'MXN'}]}]})
  }))
  const input={sessionId,candidateIds:[candidateId],country:'MX',currency:'MXN',destination}
  const [valid]=await service.wallArtCosts(input)
  assert.equal(valid.manufacturingMinor,40000)
  assert.equal(valid.shippingMinor,13000)
  assert.equal(valid.shippingKind,'address')
  for(const [mode,code] of [
    ['noMethods','shipping_methods_unavailable'],['INVALID_PRODUCT_UID','shipping_product_invalid'],
    ['UNSUPPORTED_DESTINATION','shipping_destination_unsupported'],['INVALID_ADDRESS','shipping_address_invalid'],
    ['unknown-upstream','shipping_provider_rejected'],['network','shipping_provider_transient'],
  ]) {
    responseMode=mode
    const [failed]=await service.wallArtCosts(input)
    assert.equal(failed.manufacturingMinor,40000)
    assert.equal(failed.shippingMinor,null)
    assert.equal(failed.shippingErrorCode,code)
    assert.doesNotMatch(JSON.stringify(failed),/private upstream diagnostic|Fixture 123|test@example/)
  }
  const callsBefore=quoteCalls
  const [incomplete]=await service.wallArtCosts({...input,destination:{...destination,postalCode:''}})
  assert.equal(incomplete.shippingErrorCode,'shipping_address_invalid')
  assert.equal(quoteCalls,callsBefore)
})

test('Gelato Canvas saves the exact UID with size, material, thickness and construction',async()=>{
  const {catalogService}=await import('./service.js')
  const uid='canvas_12x16-inch-300x400-mm_canvas_wood-fsc-slim_4-0_ver'
  const attributes={UnifiedCanvasFormat:'12x16-inch-300x400-mm',CanvasMaterial:'canvas',
    CanvasThicknessType:'wood-fsc-slim',CanvasFrame:'fsc-wood',Orientation:'ver',ProductModel:'slim'}
  const supplierVariant={externalVariantId:uid,sku:uid,attributes,widthMm:304.8,heightMm:406.4}
  const supplierProduct={externalId:uid,title:'Canvas',supportedCountries:['MX'],variants:[supplierVariant]}
  const service=catalogService(nativeServiceDatabase(),actor,()=>({
    definition:async()=>({attributes:Object.entries(attributes).map(([id,value])=>({id,title:id,values:[{id:value,title:value}]}))}),
    search:async()=>({items:[supplierProduct],pagination:{offset:0,sourceCount:1}}),
    product:async()=>supplierProduct,
  }))
  const {id:artworkId}=await one("insert into artworks(id,title,sku,primary_image_url) values(gen_random_uuid(),'Studio master fixture','MASTER-CANVAS','/fixture.webp') returning id")
  const {id:sessionId}=await service.createSession({artworkId,workflow:'wall_art',providers:['gelato'],countries:['MX'],requireValidatedMasters:true})
  const input={provider:'gelato',catalogId:'canvas',presentationId:'jbu:canvas:canvas',country:'MX',selection:{}}
  const {candidates:[candidate]}=await service.nativeConfigure(input)
  assert.deepEqual(candidate.attributes,{size:attributes.UnifiedCanvasFormat,material:'canvas',
    stretcher_thickness:'wood-fsc-slim',canvas_construction:'fsc-wood',orientation:'ver',product_model:'slim'})
  const exact={...input,sessionId,externalId:uid,variantId:uid}
  await assert.rejects(service.addNativeCandidate(exact),{code:'studio_master_required'})
  const printId=(await one("insert into artwork_prints(id,artwork_id,size,edition_type) values(gen_random_uuid(),$1,'12X16IN','OPEN') returning id",[artworkId])).id
  await one(`insert into print_asset_generations(revision_id,production_file_path,artwork_id,print_id,size,is_current,production_status,layout,effective_dpi,master_approved_at)
    values(gen_random_uuid(),'master-canvas.jpg',$1,$2,'12X16IN',true,'MASTER_READY',$3,300,now())`,[artworkId,printId,JSON.stringify({
    paperWidthMm:304.8,paperHeightMm:406.4,width:3600,height:4800,sourceWidth:2400,sourceHeight:3200,
  })])
  const refreshed=await service.artworkAssets({artworkId})
  assert.equal(refreshed.revisions.length,1)
  assert.equal(refreshed.revisions[0].orientation,'portrait')
  assert.equal(refreshed.revisions[0].production_file_path,undefined)
  const {id:candidateId}=await service.addNativeCandidate(exact)
  const [product]=await service.saveWallArtDrafts({sessionId,products:[{group:'canvas',titleEs:'Canvas test',
    variants:[{candidateId,configuration:{},fit:'contain',scenes:['gallery'],primaryScene:'gallery',prices:[]}]}]})
  const detail=await service.productDetails({productId:product})
  const [saved]=detail.variants
  assert.equal(saved.provider_product_mappings[0].external_variant_id,uid)
  assert.deepEqual(Object.fromEntries(saved.product_variant_attribute_values.map(row=>[row.attribute_code,row.text_value ?? row.enum_value])),
    {...candidate.attributes,orientation:'portrait'})
  assert.deepEqual([Number(saved.wall_art_mockups.width_mm),Number(saved.wall_art_mockups.height_mm)],[304.8,406.4])
})
