import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const titles = ['First Current — Natural Wood Edition', 'First Current — Black Frame Edition',
  'Surface Drifty — Natural Wood Edition', 'Surface Drifty — Black Frame Edition']
const ids = titles.map((_, index) => `00000000-0000-4000-8000-00000000000${index + 1}`)
const buyer = '00000000-0000-4000-8000-000000000011'
const other = '00000000-0000-4000-8000-000000000012'
let db
const one = async (sql, params) => (await db.query(sql, params)).rows[0]
const readiness = async id => (await one('select physical_edition_readiness($1) as checks', [id])).checks
const switchSales = (id, enabled) => db.query('select set_physical_edition_sales_enabled($1,$2)', [id, enabled])
const save = (id, description, size = 20) => db.query(
  "select save_physical_edition($1,'LIMITED_EDITION',$2,false,$3,$3,true,$4,$5)",
  [id, size, description, ids.indexOf(id) % 2 ? 'Marco flotante negro' : 'Marco flotante de madera natural',
    ids.indexOf(id) % 2 ? 'Black floating frame' : 'Natural wood floating frame'])
const inventory = id => db.query('select * from physical_edition_inventory($1,null,0,100)', [id])

before(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function auth.role() returns text language sql as $$select 'authenticated'::text$$;
    create function public.is_jbu_admin() returns boolean language sql as $$select coalesce(current_setting('test.admin',true),'')='true'$$;
    select set_config('test.admin','true',false);
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
    create table public.profiles(id uuid primary key,full_name text);
    create table public.series(id uuid primary key, title text, editorial_status text, auto_launch boolean, launch_date timestamptz);
    create table public.artworks(
      id uuid primary key, sku text, title text, title_en text, medium text, medium_en text, year int,
      dimensions text, primary_image_url text, artist_profile_id uuid, series text, series_id uuid,
      is_historical_version boolean, status text default 'AVAILABLE', availability_status text default 'AVAILABLE',
      ownership_status text, current_owner_id uuid, pending_owner_id uuid, reserved_order_id uuid,
      price_display_mode text, base_price_mxn numeric, calculated_price_mxn numeric,
      allowed_shipping_countries text[], shipping_policy_ids uuid[], updated_at timestamptz
    );
    create table public.orders(id uuid default gen_random_uuid() primary key, stripe_session_id text unique,
      stripe_payment_intent_id text, buyer_user_id uuid, buyer_email text, buyer_name text, buyer_phone text,
      shipping_address jsonb, total_amount_mxn numeric, status text, payment_method text, payment_status text,
      paid_at timestamptz);
    create table public.order_items(id uuid default gen_random_uuid() primary key, order_id uuid, artwork_id uuid,
      title_snapshot text, sku_snapshot text, unit_price_mxn numeric, quantity int, claim_token_snapshot text);
    create table public.certificates(id uuid default gen_random_uuid() primary key, artwork_id uuid);
    create table public.auctions(artwork_id uuid,status text,payment_status text);
    create table public.artwork_offers(artwork_id uuid,status text,payment_status text,payment_due_at timestamptz);
    create table public.site_settings(id boolean, global_shipping_countries text[], default_shipping_policies jsonb);
    create table public.shipping_policies(id uuid,active boolean,method text,postal_codes text[],countries text[]);
    insert into public.site_settings values(true,array['MX'],'{}');
    insert into auth.users values('${buyer}',now()),('${other}',now());
  `)
  for (const file of [
    '20261026_active_series_discovery.sql',
    '20261114_physical_limited_editions_foundation.sql',
    '20261115_physical_edition_checkout_core.sql',
    '20261116_physical_edition_certificates.sql',
    '20261117_fix_physical_edition_sequence.sql',
    '20261203_physical_edition_experience.sql',
  ]) await db.exec(await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'))

  for (const [index, title] of titles.entries()) {
    await db.query('insert into artworks(id,sku,title,medium,dimensions) values($1,$2,$3,$4,$5)',
      [ids[index], 'CANVAS-' + index, title, 'Global Float Framed Canvas on Premium Stretcher Bars', '20 × 30 in / 51 × 76 cm'])
  }
})

after(async () => { await db?.close() })

test('four independent editions retain numbering and actionable readiness across state changes', async () => {
  const policyId = '00000000-0000-4000-8000-000000000099'
  for (const id of ids) {
    assert.equal((await readiness(id)).edition, false)
    await save(id, 'Made to order')
    const { rows } = await inventory(id)
    assert.equal(rows.length, 20)
    assert.equal(rows[19].edition_number, 20)
    assert.equal((await readiness(id)).price, false)
    assert.equal((await readiness(id)).shipping, false)
    await assert.rejects(switchSales(id, true), /edition_not_ready_for_sales/)
  }
  await db.query("insert into shipping_policies values($1,true,'FIXED_RATE','{}',array['MX'])", [policyId])
  await db.query("update site_settings set default_shipping_policies=jsonb_build_object('original',jsonb_build_array($1::text))", [policyId])
  await db.exec('update artworks set base_price_mxn=5000')
  const id = ids[0]
  assert.ok(Object.values(await readiness(id)).every(Boolean))
  const before = (await inventory(id)).rows.map(u => u.id)
  await switchSales(id, true)
  await save(id, 'Updated description')
  assert.deepEqual((await inventory(id)).rows.map(u => u.id), before)
  assert.equal((await one('select physical_edition_sales_enabled from artworks where id=$1', [id])).physical_edition_sales_enabled, true)
  await assert.rejects(save(id, 'Resize', 19), /pause_edition_first/)
  await switchSales(id, false)
  assert.equal((await one('select physical_edition_sales_enabled from artworks where id=$1', [id])).physical_edition_sales_enabled, false)
  await db.exec("select set_config('test.admin','false',false)")
  await assert.rejects(inventory(id), /forbidden/)
  await assert.rejects(switchSales(id, true), /forbidden/)
  await db.exec("select set_config('test.admin','true',false)")
})

test('paid numbered fulfillment is idempotent, scoped to the buyer, and locks unit identities', async () => {
  const id = ids[1]
  await save(id, 'Black floating frame', 1)
  await switchSales(id, true)
  const key = '00000000-0000-4000-8000-000000000021'
  const hold = (await one('select create_physical_edition_checkout_hold($1,$2,$3) result', [id,buyer,key])).result
  const retry = (await one('select create_physical_edition_checkout_hold($1,$2,$3) result', [id,buyer,key])).result
  assert.equal(retry.id, hold.id)
  await assert.rejects(db.query('select create_physical_edition_checkout_hold($1,$2,gen_random_uuid())', [id,other]), /edition_sold_out_or_reserved/)
  await db.query("select bind_physical_edition_checkout_session($1,'session-1')",[hold.id])
  const fulfill = () => one("select fulfill_physical_edition_checkout($1,'session-1','intent','collector@example.test','Collector',null,'{}',5000) result", [hold.id])
  const first = (await fulfill()).result
  assert.equal((await fulfill()).result.order_id, first.order_id)
  assert.equal((await readiness(id)).stock, false)
  assert.equal((await one('select current_owner_id from artworks where id=$1', [id])).current_owner_id, null)
  await db.query("select set_config('test.uid',$1,false)", [other])
  assert.equal((await db.query('select * from collector_physical_editions($1)', [buyer])).rows.length, 0)
  await db.query("select set_config('test.uid',$1,false)", [buyer])
  assert.equal((await db.query('select * from collector_physical_editions($1)', [buyer])).rows.length, 1)
  const snapshot = JSON.stringify({ sku: first.unit_identifier, title: titles[1], edition: '001/001', edition_type: 'PHYSICAL_LIMITED_EDITION' })
  const issue = owner => one('select issue_physical_edition_certificate($1,$2,now(),$3,$4) result',
    [hold.unit_id, owner, 'a'.repeat(64), snapshot])
  await assert.rejects(issue(buyer), /certificate_requires_paid_delivery/)
  await db.query("update orders set status='DELIVERED' where id=$1", [first.order_id])
  await assert.rejects(issue(other), /certificate_requires_paid_delivery/)
  const certificate = (await issue(buyer)).result.certificate
  assert.equal(certificate.edition, '001/001')
  assert.equal((await issue(buyer)).result.created, false)
  assert.equal((await db.query('select * from collector_physical_editions($1)', [buyer])).rows[0].certificate_sku, certificate.sku)
  await switchSales(id, false)
  await assert.rejects(save(id, 'Resize', 2), /edition_units_already_allocated/)
})

test('verified expiry frees its reserved unit and an unpublished series blocks new sales', async () => {
  const id = ids[2]
  await switchSales(id, true)
  const reserve = (buyerId) => one('select create_physical_edition_checkout_hold($1,$2,gen_random_uuid()) result', [id, buyerId])
  const first = (await reserve(buyer)).result
  const second = (await reserve(other)).result
  assert.notEqual(first.unit_id, second.unit_id)
  await assert.rejects(reserve(buyer), /edition_checkout_already_open/)
  await db.query("select bind_physical_edition_checkout_session($1,'session-expire')", [first.id])
  await assert.rejects(db.query("select expire_physical_edition_checkout_hold($1,'wrong-session')", [first.id]), /edition_session_mismatch/)
  await db.query("select expire_physical_edition_checkout_hold($1,'session-expire')", [first.id])
  const replacement = (await reserve(buyer)).result
  assert.equal(replacement.unit_id, first.unit_id)
  await db.query("update artworks set status='DRAFT' where id=$1", [id])
  assert.equal((await readiness(id)).publication, false)
  await db.exec("select set_config('test.admin','false',false)")
  assert.equal((await one('select physical_edition_counts($1) result', [id])).result, null)
  await db.exec("select set_config('test.admin','true',false)")
})
