import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { isHomeEligible } from './homeSeries.js'
import { isArtworkPurchasable } from './artworkStatus.js'

const root = '10000000-0000-0000-0000-000000000001'
const older = '10000000-0000-0000-0000-000000000002'
const next = '10000000-0000-0000-0000-000000000003'
const latest = '10000000-0000-0000-0000-000000000004'
const sold = '10000000-0000-0000-0000-000000000005'
const denied = '10000000-0000-0000-0000-000000000006'
const event = '10000000-0000-0000-0000-000000000007'
const privateSeries = '10000000-0000-0000-0000-000000000008'
const withoutNote = '10000000-0000-0000-0000-000000000009'
let db

const create = (parent, id, kind, image = null, linked = null, note = 'Stage note') => db.query(
  'select create_artwork_version($1,$2,$3,$4,$5,$6,$7) as version',
  [parent, id, kind, 'Version test', image, note, linked],
)
const publish = (id, sale) => db.query('select publish_artwork_version($1,$2) as version', [id, sale])
const record = id => db.query('select * from artworks where id=$1', [id]).then(r => r.rows[0])
const family = id => db.query('select * from public_artwork_versions($1)', [id]).then(r => r.rows)

before(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create type artwork_status as enum ('AVAILABLE','DRAFT','OWNED');
    create type availability_status as enum ('AVAILABLE','RESERVED','SOLD','NOT_FOR_SALE');
    create table series(id uuid primary key, title text, editorial_status text, auto_launch boolean, launch_date timestamptz);
    create table artworks (
      id uuid primary key, sku varchar(24) unique, title text, title_en text, series text, series_id uuid, artist_profile_id uuid,
      medium text, medium_en text, year integer, dimensions text, description text, description_en text,
      primary_image_url text, base_price_mxn numeric, calculated_price_mxn numeric, status artwork_status default 'AVAILABLE',
      availability_status availability_status not null default 'AVAILABLE', ownership_status text default 'AVAILABLE',
      featured boolean, allows_prints boolean default false, accepts_offers boolean default false,
      physical_edition_type text default 'UNIQUE', current_owner_id uuid, pending_owner_id uuid, reserved_order_id uuid,
      certificate_hash text, certificate_issued_at timestamptz, claim_token text, price_display_mode text default 'SHOW_PRICE',
      created_at timestamptz not null, updated_at timestamptz
    );
    create table artwork_prints (artwork_id uuid, is_active boolean, is_available boolean, price numeric);
    create table auctions (artwork_id uuid, status text, payment_status text);
    create table artwork_offers (artwork_id uuid, status text, payment_status text);
    create table provenance_events (
      id uuid primary key default gen_random_uuid(), artwork_id uuid, event_type text, title text,
      description text not null default '', event_date text, date_precision text, reference_type text,
      reference_id text, dedupe_key text, visibility text, metadata jsonb, source text
    );
    create unique index provenance_events_dedupe on provenance_events(dedupe_key) where dedupe_key is not null;
    grant select on artworks, artwork_prints, series to anon, authenticated;
    insert into series values ('${privateSeries}','private','archived',false,null);
    insert into artworks(id,sku,title,primary_image_url,allows_prints,accepts_offers,claim_token,created_at)
      values ('${root}','root','Original','/original.jpg',true,true,'existing',now());
    insert into artworks(id,sku,title,primary_image_url,availability_status,ownership_status,certificate_hash,created_at)
      values ('${sold}','sold','Sold original','/sold.jpg','SOLD','SOLD','original-certificate',now());
    insert into artwork_prints values ('${root}',true,true,900);
    insert into provenance_events(id,artwork_id,event_type,visibility) values ('${event}','${root}','RESTORATION','ADMIN_ONLY');
  `)
  const load = file => readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8')
  const provenance = await load('20261017_provenance_history.sql')
  await db.exec(provenance.slice(provenance.indexOf('create or replace function public.record_provenance('),
    provenance.indexOf('-- Descripción de creación')))
  for (const file of ['20261026_active_series_discovery.sql', '20261123_artwork_versions.sql']) {
    await db.exec(await load(file))
  }
  await assert.rejects(create(root, withoutNote, 'SNAPSHOT', null, null, null), { code: '22001' })
  await db.exec(await load('20261124_artwork_version_save_compatibility.sql'))
})
after(async () => { await db?.close() })

test('historical snapshot reuses a saved photo, links to private provenance without publishing its metadata and leaves prints and original in place', async () => {
  await create(root, older, 'SNAPSHOT', null, event)
  await create(root, older, 'SNAPSHOT', null, event)
  const snapshot = await record(older)
  assert.equal(snapshot.version_parent_id, root)
  assert.equal(snapshot.primary_image_url, '/original.jpg')
  assert.equal(snapshot.is_historical_version, true)
  assert.equal(snapshot.claim_token, null)
  assert.equal(snapshot.allows_prints, false)
  assert.equal(isHomeEligible(snapshot, []), false)
  assert.equal(isArtworkPurchasable(snapshot), false)
  assert.equal(isArtworkPurchasable(await record(root)), true)
  assert.equal((await record(root)).allows_prints, true)
  assert.deepEqual((await db.query('select metadata,visibility from provenance_events where artwork_id=$1', [older])).rows,
    [{ metadata: { linked_event_id: event }, visibility: 'PUBLIC' }])
  assert.equal((await family(root)).length, 2)
})

test('a successor stays private and publication is atomic, preserves original prints and updates discovery', async () => {
  await create(root, next, 'SUCCESSOR', '/successor.jpg')
  assert.equal((await record(next)).status, 'DRAFT')
  assert.deepEqual(await family(next), [])
  await assert.rejects(create(root, denied, 'SUCCESSOR', '/duplicate.jpg'), /duplicate key/)
  await assert.rejects(db.query("update artworks set status='AVAILABLE' where id=$1", [next]), /artwork_version_sale_guard/)
  await assert.rejects(publish(next, true), /version_price_required/)
  assert.equal((await record(root)).is_historical_version, false)
  await db.query("insert into artwork_offers values ($1,'ACCEPTED','PENDING')", [root])
  await assert.rejects(publish(next, false), /version_predecessor_locked/)
  await db.query("delete from artwork_offers where artwork_id=$1", [root])
  await db.query('update artworks set base_price_mxn=1000, calculated_price_mxn=1000 where id=$1', [next])
  await publish(next, true)
  await publish(next, true)
  assert.equal(isArtworkPurchasable(await record(root)), false)
  assert.equal(isArtworkPurchasable(await record(next)), true)
  assert.equal((await record(root)).accepts_offers, false)
  assert.equal((await record(root)).claim_token, 'existing')
  const projected = await family(next)
  assert.equal(projected[0].id, next)
  assert.equal(projected.find(row => row.id === root).allows_prints, true)
  assert.equal(projected.find(row => row.id === older).allows_prints, false)
})

test('hierarchy returns earlier generations while a sold original remains untouched', async () => {
  await create(next, latest, 'SUCCESSOR', '/latest.jpg')
  await publish(latest, false)
  const projected = await family(latest)
  assert.deepEqual(projected.map(row => row.id).sort(), [root, older, next, latest].sort())
  assert.equal(projected[0].id, latest)
  assert.equal(projected.filter(row => !row.is_historical_version).length, 1)
  assert.equal((await record(latest)).availability_status, 'NOT_FOR_SALE')
  await assert.rejects(db.query("update artworks set version_parent_id=$1 where id=$2", [latest, older]), /use_artwork_version_workflow/)
  await create(sold, denied, 'SUCCESSOR', '/unsold-copy.jpg')
  await assert.rejects(publish(denied, false), /version_predecessor_locked/)
  assert.equal((await record(sold)).certificate_hash, 'original-certificate')
  await db.query('update artworks set series_id=$1 where id=$2', [privateSeries, latest])
  assert.deepEqual(await family(root), [])
})

test('public role can read only the public family and cannot execute mutations', async () => {
  await db.exec('set role anon')
  try {
    await assert.rejects(publish(next, false), /permission denied/)
    assert.deepEqual(await family(denied), [])
  } finally {
    await db.exec('reset role')
  }
})


test('snapshot saves with a bounded SKU, required timestamps and no provenance note', async () => {
  await create(root, withoutNote, 'SNAPSHOT', null, null, null)
  await create(root, withoutNote, 'SNAPSHOT', null, null, null)
  const snapshot = await record(withoutNote)
  assert.match(snapshot.sku, /^ver-[0-9a-f]{16}$/)
  assert.ok(snapshot.created_at)
  assert.equal(snapshot.primary_image_url, '/original.jpg')
  assert.equal(snapshot.claim_token, null)
  assert.deepEqual((await db.query('select description,source from provenance_events where artwork_id=$1', [withoutNote])).rows,
    [{ description: '', source: 'SYSTEM' }])
})
