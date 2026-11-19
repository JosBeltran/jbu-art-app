import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const art = '10000000-0000-4000-8000-000000000001'
const print = '10000000-0000-4000-8000-000000000002'
const actor = '10000000-0000-4000-8000-000000000003'
const migrations = [
  '20261208_independent_product_catalog.sql',
  '20261209_product_catalog_legacy_reference.sql',
  '20261210_product_provider_workflows.sql',
  '20261211_product_fulfillment_preparation.sql',
]
const db = new PGlite()
const migration = file => readFile(new URL('../../supabase/migrations/' + file, import.meta.url), 'utf8')
const one = async (sql, params) => (await db.query(sql, params)).rows[0]

before(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create function valid_shipping_countries(text[]) returns boolean language sql immutable
      as $$ select $1 is null or $1 <@ array['MX','US','CA','GB','SE']::text[] $$;
    create table artworks(id uuid primary key,title text,title_en text,sku text,physical_edition_type text,
      status text,is_historical_version boolean,version_kind text,version_published_at timestamptz,allows_prints boolean,
      print_price_mxn numeric,base_price_mxn numeric,calculated_price_mxn numeric,allowed_shipping_countries text[]);
    create table artwork_prints(id uuid primary key,artwork_id uuid references artworks,
      title text,sku text,price numeric,size text,paper_type text,finish text,framing text,edition_type text,allowed_shipping_countries text[]);
    create table orders(id uuid primary key,shipping_address jsonb,stripe_session_id text,payment_method text,payment_status text,
      status text,charged_currency text,buyer_name text,buyer_email text,buyer_phone text);
    create table order_items(id uuid primary key,order_id uuid references orders,print_variant_id uuid references artwork_prints,
      title_snapshot text,unit_price_mxn numeric,quantity integer);
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
