import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import {
  inventoryImageSource, inventoryParams, inventoryReturnPath, normalizeInventorySearch,
  parseInventoryPreferences, parseInventoryQuery,
} from './adminArtworkInventory.js'
import { requireCertificateAdmin } from './certificates/adminAuth.server.js'

test('inventory serializes navigation, normalizes text, and validates account preferences and thumbnail sources', () => {
  const input = new URLSearchParams('q=ÓRBITA&size=50&page=3&version=historical&series=Óleo&sort=price&dir=asc&group=series')
  const query = parseInventoryQuery(input)
  assert.equal(query.page, 3)
  assert.equal(normalizeInventorySearch(query.search), 'orbita')
  assert.deepEqual(parseInventoryQuery(inventoryParams(query)), query)
  assert.equal(inventoryReturnPath('//other.test/admin/artworks'), '/admin/artworks')
  assert.match(inventoryReturnPath('/admin/artworks?' + input), /page=3/)
  const id = '00000000-0000-4000-8000-000000000001'
  const restored = parseInventoryPreferences({ version: 1, layout: { columns: ['status', 'title'], density: 'compact' },
    views: [{ id, name: 'Studio', layout: { columns: ['year', 'title'] }, filters: query.filters, settings: query }] })
  assert.deepEqual(restored.layout.columns, ['status', 'title'])
  assert.deepEqual(restored.views[0].filters, query.filters)
  assert.deepEqual(restored.views[0].settings, { sort: 'price', descending: false, group: 'series', size: 50 })
  assert.equal(parseInventoryPreferences({ version: 2, views: [] }), null)
  const host = 'https://example.supabase.co'
  assert.equal(inventoryImageSource('assets-optimized/artworks/test.webp', host), '/assets-optimized/artworks/test.webp')
  assert.equal(inventoryImageSource(host + '/storage/v1/object/public/artworks/artwork-images/test.webp', host),
    host + '/storage/v1/object/public/artworks/artwork-images/test.webp')
  assert.equal(inventoryImageSource(host + '/storage/v1/object/sign/artworks/test.webp', host), null)
  assert.equal(inventoryImageSource(host + '/storage/v1/object/public/artworks/master/test.webp', host), null)
  assert.equal(inventoryImageSource('https://other.supabase.co/storage/v1/object/public/artworks/artwork-images/test.webp', host), null)
})

test('inventory authorization uses the existing verified administrator role', async () => {
  const request = new Request('http://localhost/api/admin/artworks/inventory', { headers: { Authorization: 'Bearer fixture' } })
  const makeUserClient = (isAdmin, user = { id: 'fixture-user' }) => () => ({
    auth: { getUser: async token => {
      assert.equal(token, 'fixture')
      return { data: { user } }
    } },
    rpc: async name => {
      assert.equal(name, 'is_jbu_admin')
      return { data: isAdmin }
    },
  })
  await assert.rejects(requireCertificateAdmin(new Request(request.url)), { status: 401 })
  await assert.rejects(requireCertificateAdmin(request, { makeUserClient: makeUserClient(true, null) }), { status: 401 })
  await assert.rejects(requireCertificateAdmin(request, { makeUserClient: makeUserClient(false) }), { status: 403 })
  assert.deepEqual(await requireCertificateAdmin(request, { makeUserClient: makeUserClient(true) }), { user: { id: 'fixture-user' } })
})

test('inventory SQL across 750 artworks with version, print and workflow fixtures', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create type availability_status as enum ('AVAILABLE','NOT_FOR_SALE','RESERVED','SOLD');
    create table profiles (id uuid primary key, full_name text, email text);
    create table series (id uuid primary key, title text, name_es text, name_en text);
    create table artworks (
      id uuid primary key, title text, title_en text, sku text, primary_image_url text, series text, series_id uuid,
      year integer, medium text, base_price_mxn numeric, calculated_price_mxn numeric, price_display_mode text,
      status text default 'AVAILABLE', availability_status availability_status default 'AVAILABLE',
      ownership_status text default 'AVAILABLE', physical_edition_type text default 'UNIQUE',
      current_owner_id uuid, pending_owner_id uuid, reserved_order_id uuid, certificate_hash text,
      certificate_issued_at timestamptz, claim_token text, is_historical_version boolean default false,
      version_kind text, version_published_at timestamptz, version_parent_id uuid,
      allows_prints boolean default false, print_price_mxn numeric, print_type text, print_edition_size integer,
      prints_sold integer, created_at timestamptz, updated_at timestamptz,
      description text default repeat('excluded description', 250)
    );
    create table artwork_prints (artwork_id uuid, is_active boolean, is_available boolean,
      price numeric, edition_type text, max_edition_size integer, prints_sold integer, id uuid default gen_random_uuid());
    create table product_variants (id uuid, product_id uuid, replaces_print_id uuid);
    create table artwork_products (artwork_id uuid, product_id uuid, is_primary boolean);
    create function public_fine_art_variant_ids(uuid[], uuid[]) returns table(id uuid)
      language sql as 'select product_variants.id from product_variants';
    create table auctions (artwork_id uuid, status text, payment_status text);
    create table artwork_offers (artwork_id uuid, status text, payment_status text);
    create table orders (id uuid, status text);
    create table order_items (artwork_id uuid, order_id uuid, product_type_snapshot text);
    create view artworks_discoverable as select * from artworks where status = 'AVAILABLE';
    grant select on all tables in schema public to service_role;
    grant update on artworks to service_role;
    grant update on auctions, artwork_offers, orders, order_items to service_role;
    insert into series values (md5('series')::uuid, 'Órbitas', 'Órbitas', 'Orbital Studies');
    insert into profiles values (md5('owner')::uuid, 'María Álvarez', 'collector@example.test');
    insert into artworks(id,title,title_en,sku,primary_image_url,year,series_id,medium,base_price_mxn,created_at)
    select md5(n::text)::uuid, 'Pieza ' || n, 'Artwork ' || n, 'SKU-' || n,
      '/assets-optimized/artworks/' || n || '.webp', 2020 + n % 2,
      case when n % 3 = 0 then md5('series')::uuid end, 'Oil', 100 + n,
      '2025-01-01'::timestamptz + n * interval '1 minute' from generate_series(1,750) n;
    update artworks set title = 'Óleo Cálido', title_en = 'Warm Glow', current_owner_id = md5('owner')::uuid,
      claim_token = 'UNIQUE_8%TOKEN', is_historical_version = true, version_kind = 'SNAPSHOT',
      version_parent_id = md5('2')::uuid, availability_status = 'NOT_FOR_SALE', allows_prints = true where sku = 'SKU-3';
    insert into artwork_prints values (md5('3')::uuid,true,true,200,'LIMITED',5,2,md5('legacy')::uuid),
      (md5('3')::uuid,true,true,200,'LIMITED',5,5,default);
    insert into artwork_products values (md5('3')::uuid,md5('studio-product')::uuid,true);
    insert into product_variants values (md5('studio-variant')::uuid,md5('studio-product')::uuid,md5('legacy')::uuid);
    update artworks set ownership_status = 'SOLD', availability_status = 'SOLD' where sku = 'SKU-4';
    update artworks set physical_edition_type = 'LIMITED_EDITION' where sku = 'SKU-5';
    update artworks set reserved_order_id = md5('order')::uuid where sku = 'SKU-6';
    update artworks set status = 'DRAFT' where sku = 'SKU-7';
    insert into auctions values (md5('8')::uuid,'LIVE',null);
    insert into artwork_offers values (md5('9')::uuid,'ACCEPTED','PENDING');
    insert into orders values (md5('order')::uuid, 'DELIVERED');
    insert into order_items values (md5('10')::uuid, md5('order')::uuid, null), (md5('11')::uuid, md5('order')::uuid, 'PRINT');
  `)
  await db.exec(await readFile(new URL('../supabase/migrations/20261227_admin_artwork_inventory.sql', import.meta.url), 'utf8'))

  async function list({ search = '', filters = {}, sort = 'created_at', descending = true, page = 1, size = 25, facets = false } = {}) {
    const { rows } = await db.query('select admin_artwork_inventory($1,$2,$3,$4,$5,$6,$7) value',
      [normalizeInventorySearch(search), JSON.stringify(filters), sort, descending, page, size, facets])
    return rows[0].value
  }
  await db.exec('set role authenticated')
  await assert.rejects(list(), /permission denied/)
  await assert.rejects(db.query("select admin_change_artwork_inventory_availability(array[md5('1')::uuid],'NOT_FOR_SALE',true)"), /permission denied/)
  await db.exec('set role service_role')

  const first = await list({ facets: true })
  assert.equal(first.total, 750)
  assert.equal(first.rows.length, 25)
  assert.equal(first.rows[0].sku, 'SKU-750')
  assert.deepEqual(first.facets.series, ['Órbitas'])
  assert.equal(Object.hasOwn(first.rows[0], 'description'), false)
  const second = await list({ page: 2 })
  assert.equal(second.rows[0].sku, 'SKU-725')
  assert.equal((await list({ size: 50, page: 15 })).rows.length, 50)
  assert.equal((await list({ size: 100, page: 8 })).rows.length, 50)
  for (const search of ['oLEO ca', 'warm g', 'sKu-3', 'maria alv', '@EXAMPLE', '_8%token', 'ORBITAS', 'orbital stud']) {
    assert.ok((await list({ search, sort: 'price', descending: false })).rows.some(row => row.sku === 'SKU-3'), search)
  }
  assert.equal((await list({ search: '%missing' })).total, 0)
  const matched = await list({ filters: { series: ['Órbitas'], year: ['2020','2021'], version: ['historical'], prints: ['true'] } })
  assert.equal(matched.total, 1)
  assert.equal(matched.rows[0].prints, 1)
  assert.equal(matched.rows[0].has_versions, true)
  assert.equal(matched.rows[0].can_change_status, false)
  assert.equal(first.rows[0].can_change_status, true)
  assert.equal((await list({ filters: { year: ['2020'], version: ['historical'] } })).total, 0)

  async function change(numbers, target, apply) {
    const { rows } = await db.query(`select admin_change_artwork_inventory_availability(
      array(select md5(n::text)::uuid from unnest($1::int[]) n),$2,$3) value`, [numbers, target, apply])
    return rows[0].value
  }
  const protectedSelection = [1, 3, 4, 5, 6, 8, 9, 10, 999]
  const preview = await change(protectedSelection, 'NOT_FOR_SALE', false)
  assert.equal(preview.filter(row => row.outcome === 'eligible').length, 1)
  assert.equal(preview.filter(row => row.outcome === 'failed').length, 1)
  assert.equal((await list({ search: 'SKU-1', sort: 'price', descending: false })).rows[0].availability, 'AVAILABLE')
  const applied = await change(protectedSelection, 'NOT_FOR_SALE', true)
  assert.equal(applied.filter(row => row.outcome === 'successful').length, 1)
  assert.equal(applied.filter(row => row.outcome === 'skipped').length, 7)
  assert.equal((await change([1], 'NOT_FOR_SALE', true))[0].reason, 'already_set')
  assert.equal((await change([1], 'AVAILABLE', true))[0].outcome, 'successful')
  assert.equal((await change([4], 'AVAILABLE', true))[0].reason, 'protected_workflow')
  assert.equal((await change([7], 'NOT_FOR_SALE', true))[0].outcome, 'successful')
  assert.equal((await change([7], 'AVAILABLE', true))[0].reason, 'not_ready_for_sale')
  assert.equal((await change([11], 'NOT_FOR_SALE', true))[0].outcome, 'successful')
  await assert.rejects(change([1], 'SOLD', true), /invalid_inventory_transition/)
})
