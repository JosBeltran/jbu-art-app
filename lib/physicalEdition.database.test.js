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
    create type public.availability_status as enum ('AVAILABLE','NOT_FOR_SALE','RESERVED','SOLD');
    create table public.artworks(
      id uuid primary key, sku text, title text, title_en text, medium text, medium_en text, year int,
      dimensions text, primary_image_url text, artist_profile_id uuid, series text, series_id uuid,
      status text default 'AVAILABLE', availability_status availability_status default 'AVAILABLE',
      description text, description_en text, featured boolean, allows_prints boolean, accepts_offers boolean,
      certificate_hash text, certificate_number text, certificate_issued_at timestamptz, claim_token text,
      created_at timestamptz not null default now(),
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
    create table public.artwork_images(id uuid primary key default gen_random_uuid(), artwork_id uuid references artworks(id), image_url text);
    create table public.artwork_prints(artwork_id uuid, is_active boolean, is_available boolean, price numeric);
    create table public.provenance_events(
      id uuid primary key default gen_random_uuid(), artwork_id uuid, event_type text, title text,
      description text not null default '', event_date text, date_precision text, reference_type text,
      reference_id text, dedupe_key text, visibility text, metadata jsonb, source text
    );
    create unique index provenance_events_dedupe on provenance_events(dedupe_key) where dedupe_key is not null;
    create table public.auctions(artwork_id uuid,status text,payment_status text);
    create table public.artwork_offers(artwork_id uuid,status text,payment_status text,payment_due_at timestamptz);
    create table public.site_settings(id boolean, global_shipping_countries text[], default_shipping_policies jsonb);
    create table public.shipping_policies(id uuid,active boolean,method text,postal_codes text[],countries text[]);
    insert into public.site_settings values(true,array['MX'],'{}');
    insert into auth.users values('${buyer}',now()),('${other}',now());
  `)
  const load = file => readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8')
  const provenance = await load('20261017_provenance_history.sql')
  await db.exec(provenance.slice(provenance.indexOf('create or replace function public.record_provenance('),
    provenance.indexOf('-- Descripción de creación')))
  for (const file of [
    '20261026_active_series_discovery.sql',
    '20261114_physical_limited_editions_foundation.sql',
    '20261115_physical_edition_checkout_core.sql',
    '20261116_physical_edition_certificates.sql',
    '20261117_fix_physical_edition_sequence.sql',
    '20261123_artwork_versions.sql',
    '20261124_artwork_version_save_compatibility.sql',
    '20261203_physical_edition_experience.sql',
    '20261204_detach_artwork_successor.sql',
    '20261205_physical_edition_checkout_recovery.sql',
  ]) await db.exec(await load(file))
  await db.exec('grant all on artworks, artwork_edition_units, order_items, certificates, auctions, artwork_offers, provenance_events to service_role')

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


test('detaching an unpublished physical successor preserves the source, all 20 units, images and unrelated provenance', async () => {
  const source = '00000000-0000-4000-8000-000000000041'
  const successor = '00000000-0000-4000-8000-000000000042'
  const otherSource = '00000000-0000-4000-8000-000000000043'
  const linked = '00000000-0000-4000-8000-000000000044'
  const published = '00000000-0000-4000-8000-000000000045'
  const title = titles[0]
  const record = id => one('select * from artworks where id=$1', [id])
  const units = () => db.query('select * from artwork_edition_units where artwork_id=$1 order by edition_number', [successor])
  const detach = (id = successor, parent = source) => db.query('select detach_artwork_successor($1,$2) as version', [id,parent])
  const blocker = async id => (await one('select artwork_successor_detach_blocker($1) as reason', [id])).reason
  const create = (parent, id, event = null) => db.query(
    "select create_artwork_version($1,$2,'SUCCESSOR',$3,'/edition.jpg','Keep this note',$4)", [parent,id,title,event])
  await db.query("insert into artworks(id,sku,title,ownership_status,accepts_offers) values($1,'first-current','First Current','AVAILABLE',true),($2,'other-source','Other Source','AVAILABLE',true)", [source,otherSource])
  await db.query("insert into provenance_events(id,artwork_id,event_type,visibility) values($1,$2,'RESTORATION','ADMIN_ONLY')", [linked,source])
  await create(source, successor, linked)
  await save(successor, 'Natural wood edition')
  const policyId = '00000000-0000-4000-8000-000000000098'
  await db.query("insert into shipping_policies values($1,true,'FIXED_RATE','{}',array['MX'])", [policyId])
  await db.query("update artworks set base_price_mxn=3800,allowed_shipping_countries=array['MX'],shipping_policy_ids=array[$2::uuid] where id=$1", [successor,policyId])
  await db.query("insert into artwork_images(artwork_id,image_url) values($1,'/detail.jpg')", [successor])
  await db.query("insert into provenance_events(artwork_id,event_type,title,source) values($1,'RESTORATION','Independent record','MANUAL')", [successor])

  const sourceBefore = await record(source)
  const sourceProvenance = await db.query('select * from provenance_events where artwork_id=$1', [source])
  const successorBefore = await record(successor)
  const unitsBefore = (await units()).rows
  const images = await db.query('select * from artwork_images where artwork_id=$1', [successor])
  const unchangedEvent = await one("select * from provenance_events where artwork_id=$1 and source='MANUAL'", [successor])
  assert.equal(unitsBefore.length, 20)
  assert.equal(await blocker(successor), null)
  assert.equal((await readiness(successor)).publication, false)
  await assert.rejects(switchSales(successor, true), /edition_not_ready_for_sales/)
  await assert.rejects(detach(successor, otherSource), /version_not_detachable/)

  for (const role of ['anon', 'authenticated']) {
    await db.exec('set role ' + role)
    try { await assert.rejects(detach(), { code: '42501' }) }
    finally { await db.exec('reset role') }
  }

  const rejectCommitment = async (set, clear) => {
    await db.query(set, [successor])
    assert.equal(await blocker(successor), 'version_commercially_committed')
    await assert.rejects(detach(), /version_commercially_committed/)
    await db.query(clear, [successor])
  }
  await rejectCommitment("update artwork_edition_units set status='RESERVED' where artwork_id=$1 and edition_number=1",
    "update artwork_edition_units set status='AVAILABLE' where artwork_id=$1 and edition_number=1")
  await rejectCommitment("update artworks set ownership_status='SOLD' where id=$1",
    "update artworks set ownership_status='AVAILABLE' where id=$1")
  await rejectCommitment('insert into certificates(artwork_id) values($1)', 'delete from certificates where artwork_id=$1')
  await rejectCommitment("insert into artwork_offers(artwork_id,status,payment_status) values($1,'ACCEPTED','PENDING')",
    'delete from artwork_offers where artwork_id=$1')
  assert.equal(await blocker(successor), null)

  await create(otherSource, published)
  await db.query('select publish_artwork_version($1,false)', [published])
  await assert.rejects(detach(published, otherSource), /version_not_detachable/)

  await db.exec('set role service_role')
  try {
    const result = (await detach()).rows[0].version
    assert.deepEqual(result, { id: successor, sku: successorBefore.sku })
  } finally { await db.exec('reset role') }

  const detached = await record(successor)
  assert.deepEqual(detached, {
    ...successorBefore, version_parent_id: null, version_kind: null, updated_at: detached.updated_at,
  })
  assert.equal(detached.status, 'DRAFT')
  assert.equal(detached.physical_edition_type, 'LIMITED_EDITION')
  assert.equal(detached.physical_edition_size, 20)
  assert.deepEqual((await units()).rows, unitsBefore)
  assert.deepEqual((await db.query('select * from artwork_images where artwork_id=$1', [successor])).rows, images.rows)
  assert.deepEqual(await one("select * from provenance_events where artwork_id=$1 and source='MANUAL'", [successor]), unchangedEvent)
  assert.deepEqual(await one("select event_type,description,visibility,reference_type,reference_id,metadata from provenance_events where artwork_id=$1 and source='SYSTEM'", [successor]), {
    event_type: 'ARTWORK_VERSION_DETACHED', description: 'Keep this note', visibility: 'ADMIN_ONLY',
    reference_type: null, reference_id: null, metadata: {},
  })
  assert.deepEqual((await db.query('select * from provenance_events where artwork_id=$1', [source])).rows, sourceProvenance.rows)
  await assert.rejects(db.query('select publish_artwork_version($1,true)', [successor]), /artwork_not_found/)
  await assert.rejects(detach(), /version_not_detachable/)
  assert.equal((await readiness(successor)).publication, false)

  await db.query("update artworks set status='AVAILABLE',availability_status='AVAILABLE' where id=$1", [successor])
  assert.ok(Object.values(await readiness(successor)).every(Boolean))
  await switchSales(successor, true)
  assert.equal((await record(successor)).physical_edition_sales_enabled, true)
  assert.deepEqual(await record(source), sourceBefore)
  assert.deepEqual((await units()).rows, unitsBefore)
})


test('durable Stripe creation fences cancellation, preserves parameters and protects paid units', async () => {
  const art = '00000000-0000-4000-8000-000000000091'
  await db.query("insert into artworks(id,sku,title,medium,dimensions,base_price_mxn) values($1,'RECOVERY','Recovery edition','Canvas','20 x 30 in',5000)", [art])
  await db.query("select save_physical_edition($1,'LIMITED_EDITION',2,false,'Made to order','Made to order',true,'Wood','Wood')", [art])
  await switchSales(art, true)
  const reserve = async key => (await one('select create_physical_edition_checkout_hold($1,$2,$3) result', [art, buyer, key])).result
  const key = '00000000-0000-4000-8000-000000000092'
  const [first, duplicate] = await Promise.all([reserve(key), reserve(key)])
  assert.equal(first.id, duplicate.id)
  assert.equal((await one("select count(*)::int n from artwork_edition_units where artwork_id=$1 and status='RESERVED'", [art])).n, 1)
  assert.equal((await one('select cancel_unbound_physical_edition_hold($1,$2) ok', [first.id, other])).ok, false)
  const params = { mode: 'payment', metadata: { physical_edition_hold_id: first.id, user_id: buyer }, currency: 'usd' }
  const prepare = (who, payload) => one('select prepare_physical_edition_session($1,$2,$3) result', [first.id, who, JSON.stringify(payload)])
  await assert.rejects(prepare(other, params), /invalid_edition_hold/)
  assert.deepEqual((await prepare(buyer, params)).result, params)
  assert.deepEqual((await prepare(buyer, { ...params, currency: 'mxn' })).result, params)
  assert.equal((await one('select cancel_unbound_physical_edition_hold($1,$2) ok', [first.id, buyer])).ok, false)
  // Missing the original response/binding must still permit binding an expired
  // DB hold to the SAME verified Stripe session for reconciliation.
  await db.query("update physical_edition_checkout_holds set expires_at=now()-interval '1 hour' where id=$1", [first.id])
  await db.query("select bind_physical_edition_checkout_session($1,'recovery-paid')", [first.id])
  await assert.rejects(db.query("select bind_physical_edition_checkout_session($1,'foreign')", [first.id]), /session_already_bound/)
  await db.query("select fulfill_physical_edition_checkout($1,'recovery-paid','pi','buyer@example.test','Buyer',null,'{}',5000)", [first.id])
  assert.equal((await one("select expire_physical_edition_checkout_hold($1,'recovery-paid') ok", [first.id])).ok, false)
  assert.equal((await one('select status from artwork_edition_units where id=$1', [first.unit_id])).status, 'SOLD')
  // A newly-created READY hold can be cancelled once and its old request key
  // can never allocate a replacement purchase.
  const newKey = '00000000-0000-4000-8000-000000000093'
  const second = await reserve(newKey)
  const cancellations = await Promise.all([one('select cancel_unbound_physical_edition_hold($1,$2) ok', [second.id, buyer]), one('select cancel_unbound_physical_edition_hold($1,$2) ok', [second.id, buyer])])
  assert.deepEqual(cancellations.map(r => r.ok).sort(), [false, true])
  await assert.rejects(reserve(newKey), /checkout_request_not_reusable/)
  await assert.rejects(one('select prepare_physical_edition_session($1,$2,$3)', [second.id, buyer, JSON.stringify({ metadata: { physical_edition_hold_id: second.id, user_id: buyer } })]), /invalid_edition_hold/)
  assert.equal((await one('select status from artwork_edition_units where id=$1', [second.unit_id])).status, 'AVAILABLE')
  const third = await reserve('00000000-0000-4000-8000-000000000094')
  assert.equal(third.unit_id, second.unit_id)
  // Legacy unbound rows are not safe to release even after the DB deadline.
  await db.query("update physical_edition_checkout_holds set creation_state=null,expires_at=now()-interval '1 hour' where id=$1", [third.id])
  assert.equal((await one('select cancel_unbound_physical_edition_hold($1,$2) ok', [third.id, buyer])).ok, false)
  assert.equal((await one('select status from artwork_edition_units where id=$1', [third.unit_id])).status, 'RESERVED')
  // Recovery RPCs and payloads are inaccessible to browser database roles.
  await db.exec('set role authenticated')
  await assert.rejects(db.query('select stripe_create_params from physical_edition_checkout_holds'), /permission denied/)
  await assert.rejects(db.query('select prepare_physical_edition_session($1,$2,$3)', [third.id, buyer, '{}']), /permission denied/)
  await db.exec('reset role')
})

test('both transactional webhook/expiry orderings keep exactly one terminal inventory outcome', async () => {
  const art = '00000000-0000-4000-8000-000000000095'
  await db.query("insert into artworks(id,sku,title,medium,dimensions,base_price_mxn) values($1,'RECOVERY-RACE','Race edition','Canvas','20 x 30 in',5000)", [art])
  await db.query("select save_physical_edition($1,'LIMITED_EDITION',2,false,'Made to order','Made to order',true,'Wood','Wood')", [art])
  await switchSales(art, true)
  for (const paidFirst of [false, true]) {
    const hold = (await one('select create_physical_edition_checkout_hold($1,$2,gen_random_uuid()) result', [art, buyer])).result
    const session = `recovery-race-${paidFirst}`
    await db.query('select bind_physical_edition_checkout_session($1,$2)', [hold.id, session])
    const expire = () => one('select expire_physical_edition_checkout_hold($1,$2) result', [hold.id, session])
    const pay = () => one("select fulfill_physical_edition_checkout($1,$2,'pi','buyer@example.test','Buyer',null,'{}',5000) result", [hold.id, session])
    // PGlite queues transactions; exercise both possible winners of the row lock.
    const outcomes = await Promise.allSettled(paidFirst ? [pay(), expire()] : [expire(), pay()])
    const row = await one('select status,order_id from physical_edition_checkout_holds where id=$1', [hold.id])
    const unit = await one('select status from artwork_edition_units where id=$1', [hold.unit_id])
    assert.equal(row.status, paidFirst ? 'PAID' : 'EXPIRED')
    assert.equal(unit.status, paidFirst ? 'SOLD' : 'AVAILABLE')
    assert.equal((await one('select count(*)::int n from orders where stripe_session_id=$1', [session])).n, paidFirst ? 1 : 0)
    if (paidFirst) {
      assert.equal(outcomes[1].value.result, false)
      assert.equal((await pay()).result.order_id, row.order_id)
    } else {
      assert.equal(outcomes[1].status, 'rejected')
      assert.match(outcomes[1].reason.message, /edition_hold_not_payable/)
      assert.equal((await expire()).result, false)
    }
  }
})
