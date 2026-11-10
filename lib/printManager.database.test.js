import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { validatePrintForm } from './printManager.js'

const art = '10000000-0000-0000-0000-000000000001'
const otherArt = '10000000-0000-0000-0000-000000000002'
const open = '20000000-0000-0000-0000-000000000001'
const limited = '20000000-0000-0000-0000-000000000002'
const third = '20000000-0000-0000-0000-000000000003'
const gallery = '30000000-0000-0000-0000-000000000001'
const buyer = '40000000-0000-0000-0000-000000000001'
let db

const migration = file => readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8')
const save = (row, create = true) => db.query('select save_admin_artwork_print($1::jsonb,$2) variant', [JSON.stringify(row), create])
  .then(result => result.rows[0].variant)
function fields(id, changes = {}) {
  const row = validatePrintForm({
    id, artwork_id: art, title: 'Fine Art', description: 'Edición', description_en: 'Edition',
    sku: 'FA-' + id.at(-1), size: 'A3', price: 1200, finish: 'FINE_ART', currency: 'MXN',
    edition_type: 'OPEN', create: true, is_active: false, ...changes,
  })
  return {
    ...row, image_url: changes.image_url || null, print_gallery_image_id: changes.print_gallery_image_id || null,
    print_provenance_image_id: changes.print_provenance_image_id || null,
  }
}

before(async () => {
  db = new PGlite()
  // Minimal production-shaped fixture. The checked-in migrations depend on these pre-existing tables.
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text);
    alter table storage.objects enable row level security;
    create policy existing_wide_storage_access on storage.objects for all to anon, authenticated using (true) with check (true);
    grant usage on schema storage to anon, authenticated;
    grant select, insert on storage.objects to anon, authenticated;
    insert into storage.objects values ('artworks','preview.webp'), ('print-masters','master.jpg');
    create type print_finish as enum ('FINE_ART','CANVAS','GLOSS','MATTE','RESIN');
    create type print_edition as enum ('OPEN','LIMITED');
    create table artworks (
      id uuid primary key, title text, title_en text, description text, description_en text, sku text, allows_prints boolean default false, print_type text,
      prints_sold integer default 0, print_edition_size integer, availability_status text default 'SOLD',
      reserved_order_id uuid, current_owner_id uuid, pending_owner_id uuid, updated_at timestamptz,
      physical_edition_type text
    );
    create table artwork_prints (
      id uuid primary key, artwork_id uuid references artworks(id), size text, finish print_finish,
      price numeric not null check (price > 0), edition_type print_edition, max_edition_size integer, is_active boolean, is_available boolean
    );
    create table artwork_images (id uuid primary key, artwork_id uuid, image_url text, media_type text, display_order integer);
    create table provenance_events (id uuid primary key, artwork_id uuid, visibility text, event_type text);
    create table provenance_event_images (id uuid primary key, artwork_id uuid, provenance_event_id uuid, image_url text);
    create table orders (
      id uuid primary key default gen_random_uuid(), stripe_session_id text unique, stripe_payment_intent_id text,
      buyer_user_id uuid, buyer_email text, buyer_name text, buyer_phone text, shipping_address jsonb,
      total_amount_mxn numeric, status text, payment_method text, payment_status text, paid_at timestamptz,
      charged_currency text, charged_amount numeric, fx_usd_per_mxn numeric, production_status text, order_origin text
    );
    create table order_items (
      id uuid primary key default gen_random_uuid(), order_id uuid references orders(id), artwork_id uuid references artworks(id),
      title_snapshot text, sku_snapshot text, unit_price_mxn numeric, quantity int, claim_token_snapshot text,
      print_variant_id uuid references artwork_prints(id), print_size_snapshot text, print_finish_snapshot text,
      product_type_snapshot text, physical_edition_unit_id uuid
    );
    create table guest_open_print_checkouts (
      id uuid primary key, items jsonb, buyer_user_id uuid, stripe_session_id text, order_id uuid,
      fulfilled_at timestamptz, fulfillment_last_error text, fulfillment_failed_at timestamptz
    );
    create table artwork_edition_units (id uuid, artwork_id uuid);
    create function is_jbu_admin() returns boolean language sql as
      $$select coalesce(current_setting('jbu.test_admin', true), '') = 'yes'$$;
    create function complete_order_originals(uuid) returns void language plpgsql as $$begin return; end$$;
    alter table artwork_prints enable row level security;
    create policy baseline_read on artwork_prints for select to anon, authenticated using (true);
    create policy baseline_write on artwork_prints for all to authenticated using (true) with check (true);
    grant select, insert, update, delete on artwork_prints to anon, authenticated, service_role;
    insert into artworks(id,title,sku,physical_edition_type) values
      ('${art}', 'Original', 'ORIGINAL-1', 'LIMITED_EDITION'), ('${otherArt}', 'Other', 'ORIGINAL-2', 'UNIQUE');
    insert into artwork_images values ('${gallery}', '${otherArt}', '/wrong-parent.webp', 'image', 0);
  `)
  await db.exec(await migration('20261120_print_variant_images.sql'))
  await db.exec(await migration('20261122_fine_art_prints_manager.sql'))
  await db.exec(await migration('20261125_print_asset_generation.sql'))
  await db.exec(`create trigger fixture_order_guard before insert on order_items
    for each row execute function block_unimplemented_physical_edition_sales()`)
})
after(async () => { await db?.close() })

test('database creates a draft, retries safely, publishes and edits without creating an artwork', async () => {
  const row = fields(open)
  assert.equal((await save(row)).is_active, false)
  assert.equal((await save(row)).id, open)
  await assert.rejects(save({ ...row, title: 'Different request' }), /print_retry_conflict/)
  await db.exec('set role anon')
  try {
    assert.deepEqual((await db.query('select id from artwork_prints')).rows, [])
    await assert.rejects(save(row), /permission denied/)
  } finally { await db.exec('reset role') }
  await db.exec('set role authenticated')
  try {
    await assert.rejects(db.query('insert into artwork_prints(id) values ($1)', [third]), /row-level security/)
  } finally { await db.exec('reset role') }
  const active = await save({ ...row, description: 'Actualizada', is_active: true }, false)
  assert.equal(active.description, 'Actualizada')
  assert.equal((await db.query('select allows_prints from artworks where id=$1', [art])).rows[0].allows_prints, true)
  await db.exec('set role anon')
  try { assert.deepEqual((await db.query('select id from artwork_prints')).rows, [{ id: open }]) }
  finally { await db.exec('reset role') }
  await db.query('update artwork_prints set is_active=false where id=$1', [open])
  assert.equal((await db.query('select count(*)::int count from artworks')).rows[0].count, 2)
})

test('database rejects missing parents, conflicting SKUs, wrong-parent images and identity changes', async () => {
  await assert.rejects(save(fields(third, { artwork_id: buyer })), /artwork_not_found/)
  await assert.rejects(save(fields(third, { sku: 'fa-1' })), /duplicate_print_sku/)
  await assert.rejects(save(fields(third, { print_gallery_image_id: gallery })), /invalid_gallery_print_image/)
  await assert.rejects(save(fields(open, { artwork_id: otherArt }), false), /print_identity_locked/)
})

test('registered order fulfillment consumes a limited variant once and retains the paid image and size', async () => {
  const row = fields(limited, { edition_type: 'LIMITED', max_edition_size: 1, is_active: true })
  await save(row)
  const paid = [{
    id: art, variant_id: limited, edition_type: 'LIMITED', type: 'PRINT', title: 'Purchased print',
    sku: row.sku, image_url: '/at-checkout.webp', size: 'A3', finish: 'FINE_ART', quantity: 1, unit_amount: 1200,
  }]
  const fulfill = (session, items = paid) => db.query(`
    select fulfill_stripe_order($1,null,'buyer@example.com',null,null,'{}',1200,$2,null,$3) id
  `, [session, JSON.stringify(items), buyer]).then(result => result.rows[0].id)
  await save({ ...row, size: 'A2', is_active: false }, false)
  const id = await fulfill('cs_limited_one')
  assert.equal(await fulfill('cs_limited_one'), id)
  await assert.rejects(fulfill('cs_limited_two'), /print_edition_exhausted/)
  assert.equal((await db.query('select prints_sold from artwork_prints where id=$1', [limited])).rows[0].prints_sold, 1)
  const snapshot = (await db.query('select * from order_items where order_id=$1', [id])).rows[0]
  assert.equal(snapshot.print_variant_id, limited)
  assert.equal(snapshot.print_image_url_snapshot, '/at-checkout.webp')
  assert.equal(snapshot.print_size_snapshot, 'A3')
  assert.equal(snapshot.claim_token_snapshot, null)
  assert.equal((await db.query('select buyer_user_id from orders where id=$1', [id])).rows[0].buyer_user_id, buyer)
})

test('existing guest fulfillment retains open edition snapshots', async () => {
  const item = { artwork_id: art, variant_id: open, title: 'Open print', sku: 'FA-1', size: 'A3', finish: 'FINE_ART',
    quantity: 1, unit_mxn: 1200, image_url: '/guest-checkout.webp' }
  await db.query("insert into guest_open_print_checkouts(id,items,stripe_session_id) values ($1,$2,'cs_guest')",
    [third, JSON.stringify([item])])
  const result = await db.query(`select fulfill_guest_open_print_checkout(
    $1,'cs_guest',null,'guest@example.com',null,null,'{}',1200,'MXN',1200,null) sale`, [third])
  const items = await db.query('select print_image_url_snapshot, product_type_snapshot from order_items where order_id=$1',
    [result.rows[0].sale.order_id])
  assert.deepEqual(items.rows, [{ print_image_url_snapshot: '/guest-checkout.webp', product_type_snapshot: 'OPEN_PRINT' }])
})


test('asset generation atomically creates a draft and replaces only the files of an explicitly selected variant', async () => {
  const generatedPrint = '20000000-0000-0000-0000-000000000011'
  const firstRequest = '30000000-0000-0000-0000-000000000011'
  const secondRequest = '30000000-0000-0000-0000-000000000012'
  const commit = (request, target, replace, expected, master, preview, price) => db.query(
    `select commit_print_asset_generation($1,$2,$3,$4,'A2','OPEN',$5,$6,$7,$8,$9,'{"kind":"primary"}','margin',300,
      null,null,$10,null) result`, [art, request, buyer, generatedPrint, target, replace, expected, master, preview, price],
  ).then(result => result.rows[0].result)
  const first = await commit(firstRequest, null, false, null, 'art/a2/1/master.jpg', '/first.webp', null)
  assert.equal(first.print_id, generatedPrint)
  assert.equal(first.generation_status, 'READY')
  assert.equal((await commit(firstRequest, null, false, null, 'other.jpg', '/other.webp', null)).production_file_path,
    'art/a2/1/master.jpg')
  const draft = (await db.query('select * from artwork_prints where id=$1', [generatedPrint])).rows[0]
  assert.equal(draft.price, null)
  await assert.rejects(db.query('update artwork_prints set is_active=true where id=$1', [generatedPrint]), /print_active_price_required/)
  assert.equal(draft.is_active, false)
  assert.equal(draft.size, 'A2')
  assert.equal(draft.title, 'Original · A2')
  assert.equal(draft.image_url, '/first.webp')
  assert.equal(draft.paper_type, 'Prodigi Enhanced Matte Art 200 gsm')
  await assert.rejects(commit(secondRequest, null, false, null, 'new.jpg', '/new.webp', 1500), /generation_conflict/)
  await db.query("update artwork_prints set size='A2 · 42 × 59.4 cm', price=1500, title='Keep this title', is_active=true where id=$1", [generatedPrint])
  await assert.rejects(commit(secondRequest, generatedPrint, true, null, 'new.jpg', '/new.webp', 900), /generation_conflict/)
  await commit(secondRequest, generatedPrint, true, 'art/a2/1/master.jpg', 'new.jpg', '/new.webp', 900)
  const current = (await db.query('select * from artwork_prints where id=$1', [generatedPrint])).rows[0]
  assert.equal(current.title, 'Keep this title')
  assert.equal(current.price, '1500')
  assert.equal(current.is_active, true)
  assert.equal(current.image_url, '/new.webp')
  assert.equal((await db.query('select count(*)::int n from print_asset_generations where print_id=$1', [generatedPrint])).rows[0].n, 2)
  assert.equal((await db.query('select count(*)::int n from artworks')).rows[0].n, 2)
  assert.equal((await db.query("select public from storage.buckets where id='print-masters'")).rows[0].public, false)

  for (const role of ['anon', 'authenticated']) {
    await db.exec('set role ' + role)
    try {
      assert.deepEqual((await db.query('select name from storage.objects')).rows, [{ name: 'preview.webp' }])
      await assert.rejects(db.query("insert into storage.objects values ('print-masters','another.jpg')"), /row-level security/)
      await assert.rejects(db.query('select * from print_asset_generations'), /permission denied/)
      await assert.rejects(commit(secondRequest, generatedPrint, true, 'new.jpg', 'new.jpg', '/new.webp', null), /permission denied/)
    } finally { await db.exec('reset role') }
  }
})
