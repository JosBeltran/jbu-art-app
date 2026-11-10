import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = await readFile(new URL('../supabase/migrations/20261121_digital_fine_art_downloads.sql', import.meta.url), 'utf8')
const art = '61723b32-4c9b-4ec8-8de2-dc180ca21404'
const variant = '34999d6f-c0f4-465c-b610-45269cf5c629'
const owner = '4369cfa6-80fb-4808-aa39-82327259234f'

test('digital migration isolates storage, snapshots pricing, and gates fulfillment and claims', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text);
    alter table storage.objects enable row level security;
    create policy preexisting_media_policy on storage.objects for all using (true) with check (true);
    grant usage on schema storage to anon, authenticated;
    grant select, insert on storage.objects to anon, authenticated;
    create table public.artworks (id uuid primary key, title text, discoverable boolean);
    create view public.artworks_discoverable as select id, title from public.artworks where discoverable;
    grant select on public.artworks_discoverable to service_role;
  `)
  await db.exec(migration)
  await db.exec(`
    insert into storage.objects values ('digital-art-masters'), ('public-media');
    insert into public.artworks values ('${art}', 'Mariposas', true);
    insert into public.digital_art_variants (id, artwork_id, size, width_mm, height_mm, dpi, currency, amount_minor, download_limit)
      values ('${variant}', '${art}', 'A3', 297, 420, 300, 'USD', 2500, 2);
  `)
  const sql = async (query, params) => (await db.query(query, params)).rows
  const role = async (name, run) => {
    await db.exec(`set role ${name}`)
    try { return await run() } finally { await db.exec('reset role') }
  }
  for (const name of ['anon', 'authenticated']) {
    await role(name, async () => {
      assert.deepEqual(await sql('select bucket_id from storage.objects'), [{ bucket_id: 'public-media' }])
      await assert.rejects(sql("insert into storage.objects values ('digital-art-masters')"), /row-level security/)
      await assert.rejects(sql('select * from public.digital_art_variants'), /permission denied/)
      await assert.rejects(sql("select public.redeem_digital_art_ticket('ticket')"), /permission denied/)
    })
  }
  assert.equal((await sql("select public from storage.buckets where id = 'digital-art-masters'"))[0].public, false)
  await assert.rejects(sql('update public.digital_art_variants set active=true'), /check constraint/)
  await assert.rejects(sql(`update public.digital_art_variants set active=true, master_path='old', master_name='old.jpg',
    pixel_width=3507, pixel_height=4961`), /check constraint/)

  const prepare = (buyer, guest) => role('service_role',
    () => sql('select * from public.prepare_digital_art_purchase($1,$2,$3)', [variant, buyer, guest]))
  assert.deepEqual(await prepare(null, 'guest-hash'), [])
  await sql(`update public.digital_art_variants set active=true, master_path='old', master_name='old.jpg',
    pixel_width=3510, pixel_height=4961`)
  await sql('update public.artworks set discoverable=false')
  assert.deepEqual(await prepare(null, 'guest-hash'), [])
  await sql('update public.artworks set discoverable=true')
  const [purchase] = await prepare(null, 'guest-hash')
  const [accountPurchase] = await prepare(owner, null)
  assert.deepEqual(purchase, { id: purchase.id, artwork_title: 'Mariposas', size: 'A3', currency: 'USD', amount_minor: 2500 })
  await sql(`update public.digital_art_variants set active=false, amount_minor=9900,
    master_path='new', master_name='new.jpg', download_limit=9`)
  await sql('delete from public.artworks where id=$1', [art])
  await sql("update public.digital_art_purchases set stripe_session_id='cs_1' where id=$1", [purchase.id])
  await sql("update public.digital_art_purchases set stripe_session_id='cs_2' where id=$1", [accountPurchase.id])

  await role('service_role', async () => {
    const fulfill = async (id, session, intent, currency, amount) =>
      (await sql('select public.fulfill_digital_art_purchase($1,$2,$3,$4,$5) as ok', [id, session, intent, currency, amount]))[0].ok
    const issue = async (id, buyer, guest, ticket) =>
      (await sql('select public.issue_digital_art_ticket($1,$2,$3,$4) as ok', [id, buyer, guest, ticket]))[0].ok
    const redeem = ticket => sql('select * from public.redeem_digital_art_ticket($1)', [ticket])
    assert.equal(await issue(purchase.id, null, 'guest-hash', 'ticket-before'), false)
    assert.equal(await fulfill(purchase.id, 'cs_bad', 'pi_1', 'USD', 2500), false)
    assert.equal(await fulfill(purchase.id, 'cs_1', 'pi_1', 'MXN', 2500), false)
    assert.equal(await fulfill(purchase.id, 'cs_1', 'pi_1', 'USD', 2499), false)
    assert.equal(await fulfill(purchase.id, 'cs_1', 'pi_1', 'USD', 2500), true)
    const [first] = await sql('select paid_at from public.digital_art_purchases where id=$1', [purchase.id])
    assert.equal(await fulfill(purchase.id, 'cs_1', 'pi_1', 'USD', 2500), true)
    assert.equal(await fulfill(purchase.id, 'cs_1', 'pi_bad', 'USD', 2500), false)
    assert.deepEqual((await sql('select paid_at from public.digital_art_purchases where id=$1', [purchase.id]))[0], first)
    assert.equal(await issue(purchase.id, owner, null, 'ticket-owner'), false)
    assert.equal(await issue(purchase.id, null, 'wrong-secret', 'ticket-wrong'), false)

    const tickets = ['ticket-a', 'ticket-b', 'ticket-c']
    const claims = await Promise.all(tickets.map(ticket => issue(purchase.id, null, 'guest-hash', ticket)))
    assert.equal(claims.filter(Boolean).length, 2)
    const firstTicket = tickets[claims.indexOf(true)]
    const redemptions = await Promise.all([redeem(firstTicket), redeem(firstTicket)])
    assert.deepEqual(redemptions.flat(), [{ master_path: 'old', master_name: 'old.jpg' }])
    await sql("insert into public.digital_art_tickets values ('expired-ticket', $1, now() - interval '1 second')", [purchase.id])
    assert.deepEqual(await redeem('expired-ticket'), [])

    assert.equal(await fulfill(accountPurchase.id, 'cs_2', 'pi_2', 'USD', 2500), true)
    assert.equal(await issue(accountPurchase.id, null, 'guest-hash', 'guest-account'), false)
    assert.equal(await issue(accountPurchase.id, owner, null, 'owner-account'), true)
    await sql('update public.digital_art_purchases set revoked_at=now() where id=$1', [accountPurchase.id])
    assert.deepEqual(await redeem('owner-account'), [])
    assert.equal(await issue(accountPurchase.id, owner, null, 'owner-revoked'), false)
  })
})
