import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
let db
const id = '00000000-0000-4000-8000-000000000001'
before(async () => {
  db = new PGlite()
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create function is_jbu_admin() returns boolean language sql as $$select false$$;
 create table site_settings(id boolean primary key,updated_by uuid);insert into site_settings values(true,null);
 create table artworks(id uuid primary key,allowed_shipping_countries text[]);
 create table artwork_prints(id uuid primary key,artwork_id uuid,allowed_shipping_countries text[]);
 create table orders(id uuid primary key default gen_random_uuid(),stripe_session_id text unique,total_amount_mxn numeric,shipping_address jsonb,status text,payment_method text,payment_status text);
 insert into artworks values('${id}',null);
 insert into artwork_prints values('${id}','${id}',array['GB']);`)
  await db.exec(
    await readFile(
      new URL(
        '../supabase/migrations/20261202_global_shipping_policies.sql',
        import.meta.url
      ),
      'utf8'
    )
  )
})
after(async () => {
  await db?.close()
})
test('migration preserves markets, null inheritance and explicit restrictions without copying', async () => {
  assert.deepEqual(
    (await db.query('select global_shipping_countries from site_settings'))
      .rows[0].global_shipping_countries,
    ['MX', 'CA', 'US']
  )
  assert.equal(
    (await db.query('select allowed_shipping_countries from artworks')).rows[0]
      .allowed_shipping_countries,
    null
  )
  assert.deepEqual(
    (await db.query('select allowed_shipping_countries from artwork_prints'))
      .rows[0].allowed_shipping_countries,
    ['GB']
  )
  assert.equal(
    (await db.query('select shipping_policy_ids from artwork_prints')).rows[0]
      .shipping_policy_ids,
    null
  )
  await assert.rejects(
    db.exec("update site_settings set global_shipping_countries=array['ZZ']"),
    /global_shipping_countries_valid/
  )
})
test('policy and settings writes invalidate revision while completed snapshots retain their values', async () => {
  const before = (await db.query('select shipping_revision from site_settings'))
    .rows[0].shipping_revision
  await db.exec(
    "update site_settings set global_shipping_countries=array['MX','SE']"
  )
  const after = (await db.query('select shipping_revision from site_settings'))
    .rows[0].shipping_revision
  assert.equal(Number(after), Number(before) + 1)
  await db.exec("update shipping_policies set name='Updated'")
  assert.equal(
    Number(
      (await db.query('select shipping_revision from site_settings')).rows[0]
        .shipping_revision
    ),
    Number(after) + 1
  )
})
test('snapshot and shipping total commit atomically with original order; duplicate insert cannot charge twice', async () => {
  const snap = {
    amount: 35000,
    currency: 'mxn',
    amountMxnMinor: 35000,
    country: 'SE',
    method: 'FIXED_RATE',
    minimumDays: 3,
    maximumDays: 7,
    groups: [],
  }
  await db.query(
    `insert into shipping_checkouts(id,stripe_session_id,countries,options,configuration_revision,fingerprint,selected_snapshot) values($1,'cs_paid',array['SE'],'[{}]',1,'abc',$2)`,
    [id, JSON.stringify(snap)]
  )
  await db.exec(
    `insert into orders(stripe_session_id,total_amount_mxn,shipping_address,status,payment_status) values('cs_paid',1000,'{"country":"SE"}','PAYMENT_RECEIVED','PAID')`
  )
  const order = (
    await db.query("select * from orders where stripe_session_id='cs_paid'")
  ).rows[0]
  assert.equal(Number(order.total_amount_mxn), 1350)
  assert.equal(Number(order.shipping_amount), 350)
  assert.equal(order.shipping_snapshot.minimumDays, 3)
  await assert.rejects(
    db.exec(
      "update orders set shipping_snapshot='{}' where stripe_session_id='cs_paid'"
    ),
    /shipping_snapshot_immutable/
  )
  await db.exec(
    "update shipping_policies set amount_minor=1000,method='FIXED_RATE'"
  )
  assert.equal(
    (
      await db.query(
        "select shipping_snapshot from orders where stripe_session_id='cs_paid'"
      )
    ).rows[0].shipping_snapshot.minimumDays,
    3
  )
  await assert.rejects(
    db.exec(
      `insert into orders(stripe_session_id,total_amount_mxn,shipping_address) values('cs_paid',1000,'{"country":"SE"}')`
    ),
    /unique/
  )
  assert.equal(
    (await db.query('select count(*)::int n from orders')).rows[0].n,
    1
  )
})
test('unverified manifest and destination mismatch cannot create paid orders', async () => {
  await db.exec(
    `insert into shipping_checkouts(stripe_session_id,countries,options,configuration_revision,fingerprint) values('cs_missing',array['SE'],'[{}]',1,'abc')`
  )
  await assert.rejects(
    db.exec(
      `insert into orders(stripe_session_id,total_amount_mxn,shipping_address) values('cs_missing',1000,'{"country":"SE"}')`
    ),
    /shipping_payment_not_validated/
  )
  await db.query(
    `insert into shipping_checkouts(stripe_session_id,countries,options,configuration_revision,fingerprint,selected_snapshot) values('cs_country',array['SE'],'[{}]',1,'abc',$1)`,
    [JSON.stringify({ country: 'SE' })]
  )
  await assert.rejects(
    db.exec(
      `insert into orders(stripe_session_id,total_amount_mxn,shipping_address) values('cs_country',1000,'{"country":"MX"}')`
    ),
    /shipping_destination_mismatch/
  )
})
test('buyer arranged dispatch requires paid order and validated arrangement', async () => {
  const snap = {
    amount: 0,
    currency: 'mxn',
    amountMxnMinor: 0,
    country: 'SE',
    method: 'BUYER_ARRANGED',
    groups: [],
  }
  await db.query(
    `insert into shipping_checkouts(stripe_session_id,countries,options,configuration_revision,fingerprint,selected_snapshot) values('cs_buyer',array['SE'],'[{}]',1,'abc',$1)`,
    [JSON.stringify(snap)]
  )
  await db.exec(
    `insert into orders(stripe_session_id,total_amount_mxn,shipping_address,status,payment_status) values('cs_buyer',1000,'{"country":"SE"}','PAYMENT_RECEIVED','PAID')`
  )
  assert.equal(
    (
      await db.query(
        "select shipping_status from orders where stripe_session_id='cs_buyer'"
      )
    ).rows[0].shipping_status,
    'AWAITING_SHIPPING_LABEL'
  )
  await assert.rejects(
    db.exec(
      "update orders set status='SHIPPED' where stripe_session_id='cs_buyer'"
    ),
    /shipping_arrangement_not_validated/
  )
  await db.exec(
    "update orders set shipping_label_received=true,shipping_arrangement_validated=true,status='SHIPPED' where stripe_session_id='cs_buyer'"
  )
})
test('non-admin cannot read manifests or mutate policies', async () => {
  await db.exec('set role authenticated')
  await assert.rejects(
    db.exec('select * from shipping_checkouts'),
    /permission denied/
  )
  assert.equal(
    (await db.query('select * from shipping_policies')).rows.length,
    0
  )
  await assert.rejects(
    db.exec(
      "insert into shipping_policies(name,name_en,name_es,method,amount_minor,fulfillment_provider) values('x','x','x','INCLUDED',0,'ARTIST')"
    ),
    /row-level security/
  )
  await db.exec('reset role')
})

test('session binding refuses a stale settings revision and permits the current one', async () => {
  await db.exec(
    "insert into shipping_checkouts(countries,options,configuration_revision,fingerprint) values(array['MX'],'[{}]',-1,'stale')"
  )
  const stale = (
    await db.query(
      "select id from shipping_checkouts where fingerprint='stale'"
    )
  ).rows[0].id
  await assert.rejects(
    db.query('select bind_shipping_checkout($1,$2)', [stale, 'cs_stale']),
    /shipping_configuration_changed/
  )
  await db.exec(
    "update shipping_checkouts set configuration_revision=(select shipping_revision from site_settings) where fingerprint='stale'"
  )
  assert.equal(
    (
      await db.query('select bind_shipping_checkout($1,$2) ok', [
        stale,
        'cs_current',
      ])
    ).rows[0].ok,
    true
  )
})

test('stable preparation retries preserve one manifest and never reset a paid snapshot', async () => {
  const preparedId = '00000000-0000-4000-8000-000000000099'
  const params = [
    preparedId,
    ['MX'],
    JSON.stringify([{ amount: 0 }]),
    1,
    'stable',
  ]
  await db.query('select prepare_shipping_checkout($1,$2,$3,$4,$5)', params)
  await db.query(
    'update shipping_checkouts set selected_snapshot=$1 where id=$2',
    [JSON.stringify({ amount: 0, country: 'MX' }), preparedId]
  )
  await db.query('select prepare_shipping_checkout($1,$2,$3,$4,$5)', params)
  const rows = (
    await db.query('select * from shipping_checkouts where id=$1', [preparedId])
  ).rows
  assert.equal(rows.length, 1)
  assert.equal(rows[0].selected_snapshot.country, 'MX')
  await assert.rejects(
    db.query('select prepare_shipping_checkout($1,$2,$3,$4,$5)', [
      ...params.slice(0, 4),
      'changed',
    ]),
    /shipping_preparation_conflict/
  )
})
