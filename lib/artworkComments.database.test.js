import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const id = n => '10000000-0000-0000-0000-' + String(n).padStart(12, '0')
const [art, historical, draft, hiddenArt, image, provenance, event, print, actor, writer, reader] =
  Array.from({ length: 11 }, (_, i) => id(i + 1))
let db
const query = async (sql, args = []) => (await db.query(sql, args)).rows
const one = async (sql, args) => (await query(sql, args))[0]?.value
const post = ({ user = writer, artwork = art, kind = 'artwork', ref = '', parent = null, body = 'Question', name = null, studio = false, note = false } = {}) =>
  one('select submit_artwork_comment($1,$2,$3,$4,$5,$6,\'Google name\',null,$7,$8,$9) as value',
    [user, artwork, kind, ref, parent, body, name, studio, note])
const read = ({ user = null, artwork = art, kind = 'artwork', ref = '', parent = null } = {}) =>
  one('select read_artwork_discussion($1,$2,$3,$4,1,$5) as value', [user, artwork, kind, ref, parent])
const mod = (ids, action, admin = actor) => one('select moderate_artwork_comments($1,$2::uuid[],$3) as value', [admin, ids, action])
const config = (data, artwork = null) => query('select save_artwork_comment_settings($1,$2,$3)', [actor, JSON.stringify(data), artwork])
const role = (user, state) => query('select set_comment_participant_state($1,$2,$3)', [actor, user, state])

before(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create table user_roles (user_id uuid, role text);
    create table artworks (id uuid primary key, sku text, title text, primary_image_url text, secondary_images text[],
      version_kind text, is_historical_version boolean default false, version_published_at timestamptz, allows_prints boolean default true);
    create table artwork_images(id uuid primary key, artwork_id uuid, media_type text, image_url text);
    create table provenance_event_images_public(id uuid primary key, artwork_id uuid, image_url text);
    create table artwork_provenance_public(id uuid primary key, artwork_id uuid, primary_image_url text);
    create table artwork_prints(id uuid primary key, artwork_id uuid, is_active boolean, size text, image_url text);
    create table fixture_notifications(event_key text primary key, title text);
    create function enqueue_notification(uuid,text,text,text,text,text,text,text,text) returns void language sql
      as $$ insert into fixture_notifications values($6,$9) on conflict do nothing $$;
    create view artworks_discoverable with(security_invoker=true) as select * from artworks;
    create function public_artwork_versions(uuid) returns table(is_historical_version boolean) language sql as
      $$ select false where $1='${historical}'::uuid $$;
    alter table artworks enable row level security;
    create policy public_artwork_test on artworks for select to anon,authenticated using (id<>'${hiddenArt}');
    grant select on artworks,artworks_discoverable,artwork_images,artwork_provenance_public,provenance_event_images_public,artwork_prints to anon,authenticated,service_role;
    insert into auth.users values('${actor}'),('${writer}'),('${reader}');
    insert into user_roles values('${actor}','admin');
    insert into artworks(id,sku,title,primary_image_url,secondary_images) values
      ('${art}','A-1','Artwork','/primary.webp',array['/older.jpg','/other.jpg']),
      ('${historical}','A-0','Earlier','/history.webp',null),
      ('${draft}','DRAFT','Future','/draft.webp',null),
      ('${hiddenArt}','PRIVATE','Private','/private.webp',null);
    update artworks set version_kind='SUCCESSOR' where id='${draft}';
    update artworks set is_historical_version=true where id='${historical}';
    insert into artwork_images values('${image}','${art}','image','/detail.webp');
    insert into provenance_event_images_public values('${provenance}','${historical}','/archive.webp');
    insert into artwork_provenance_public values('${event}','${historical}','/event.webp');
    insert into artwork_prints values('${print}','${art}',true,'A1','/print.webp');
  `)
  await db.exec(await readFile(new URL('../supabase/migrations/20261129_artwork_comments.sql', import.meta.url), 'utf8'))
})
after(async () => { await db?.close() })

test('public scope honors existing artwork permissions and rejects mismatched, draft and invalid media contexts', async () => {
  const visible = (artwork, kind = 'artwork', ref = '') =>
    one('select comment_context_public($1,$2,$3) as value', [artwork, kind, ref])
  await db.exec('set role anon')
  try {
    assert.equal(await visible(art, 'primary'), true)
    assert.equal(await visible(art, 'gallery', image), true)
    assert.equal(await visible(art, 'gallery', '------------------------------------'), false)
    assert.equal(await visible(historical, 'gallery', image), false)
    assert.equal(await visible(historical, 'provenance', provenance), true)
    assert.equal(await visible(historical, 'event', event), true)
    assert.equal(await visible(art, 'legacy', '/older.jpg'), true)
    assert.equal(await visible(art, 'print', print), true)
    assert.equal(await visible(draft), false)
    assert.equal(await visible(hiddenArt), false)
    await assert.rejects(read(), /permission denied/)
    await assert.rejects(query('select * from artwork_comments'), /permission denied/)
  } finally { await db.exec('reset role') }
  await db.exec('set role authenticated')
  try {
    await assert.rejects(post(), /permission denied/)
    await assert.rejects(mod([image], 'approve'), /permission denied/)
    await assert.rejects(query('update artwork_comment_participants set state=\'TRUSTED\''), /permission denied/)
  } finally { await db.exec('reset role') }
})

test('new participants are moderated, two approvals confer trust and risk overrides auto-publication', async () => {
  await config({ rate_limit: 20 })
  const first = await post({ body: 'What is the technique?', name: 'Visitor' })
  assert.equal(first.status, 'PENDING')
  assert.equal((await read()).comments.length, 0)
  assert.equal((await read({ user: reader })).comments.length, 0)
  const own = (await read({ user: writer })).comments[0]
  assert.equal(own.author_display_name, 'Visitor')
  assert.equal(own.mine, true)
  assert.equal('author_user_id' in own, false)
  await assert.rejects(mod([first.id], 'approve', writer), /forbidden/)
  assert.equal(await mod([first.id], 'approve'), 1)
  const second = await post({ body: 'Beautiful colors' })
  assert.equal(second.status, 'PENDING')
  assert.equal(await mod([second.id], 'approve'), 1)
  await query("update artwork_comments set created_at=now()-interval '2 minutes'")
  const third = await post({ body: 'The paper is lovely' })
  assert.equal(third.status, 'APPROVED')
  const html = await post({ body: '<img src=x onerror=alert(1)>' })
  assert.equal(html.status, 'PENDING')
  const link = await post({ body: 'Go to https://bit.ly/example' })
  assert.equal(link.status, 'PENDING')
  await assert.rejects(mod([link.id], 'approve'), /links_disabled/)
  assert.equal((await query("select count(*)::int n from fixture_notifications where title like 'A trusted%'"))[0].n, 2)
  assert.equal((await read()).comments.length, 3)
  const otherScope = await post({ artwork: historical, kind: 'provenance', ref: provenance, user: reader, body: 'How was this photographed?' })
  assert.equal(otherScope.status, 'PENDING')
  assert.equal(await mod([otherScope.id], 'approve'), 1)
  assert.equal((await read({ artwork: historical, kind: 'provenance', ref: provenance })).comments[0].id, otherScope.id)
  assert.equal((await read({ kind: 'provenance', ref: provenance })).comments.length, 0)
  assert.equal((await post({ kind: 'gallery', ref: image, user: reader, body: 'Is this a detail?' })).status, 'PENDING')
  assert.equal((await post({ kind: 'print', ref: print, user: reader, body: 'Which paper?' })).status, 'PENDING')
  await assert.rejects(post({ artwork: historical, kind: 'print', ref: print }), /invalid_context/)
})

test('configuration, replies, Studio identity, reports, restrictions and moderation audit remain transactional', async () => {
  const root = (await read()).comments[0]
  const reply = await post({ user: actor, studio: true, parent: root.id, body: 'This is the answer.' })
  assert.equal(reply.status, 'APPROVED')
  assert.equal((await read({ parent: root.id })).comments[0].author_display_name, 'JBU Studio')
  await assert.rejects(post({ user: actor, studio: true, parent: reply.id, body: 'Too deep' }), /invalid_reply/)
  await assert.rejects(post({ studio: true, body: 'Impersonation' }), /forbidden/)
  await assert.rejects(post({ user: actor, studio: true, kind: 'primary', parent: root.id, body: 'Wrong scope' }), /invalid_reply/)
  const note = await post({ user: actor, studio: true, note: true, body: 'Studio note' })
  assert.equal(await mod([note.id], 'pin'), 1)
  assert.equal((await read()).comments[0].id, note.id)
  const report = () => query("select report_artwork_comment($1,$2,'spam')", [reader, root.id])
  await report()
  await report()
  assert.equal((await query('select count(*)::int n from artwork_comment_reports'))[0].n, 1)
  const reported = await one("select list_admin_artwork_comments('REPORTED','',1,null) as value")
  assert.equal(reported.comments[0].id, root.id)
  assert.equal(await mod([root.id], 'review_reports'), 1)
  assert.equal(await mod([root.id], 'hide'), 1)
  assert.equal((await read({ parent: root.id })).comments.length, 0)
  assert.equal(await mod([root.id], 'delete'), 1)
  assert.equal((await query('select body,author_user_id from artwork_comments where id=$1', [root.id]))[0].author_user_id, null)

  await query("update artwork_comments set created_at=now()-interval '11 minutes'")
  await role(writer, 'TRUSTED')
  await config({ mandatory_review: true })
  assert.equal((await post({ body: 'Mandatory moderation' })).status, 'PENDING')
  await config({ mandatory_review: false, trust_threshold: 3, risk_patterns: ['limited coupon'], allow_links: true })
  assert.equal((await post({ body: 'limited coupon today' })).status, 'PENDING')
  const rejected = await post({ body: 'This message is abusive' })
  assert.equal(await mod([rejected.id], 'reject'), 1)
  await query("update artwork_comments set created_at=now()-interval '11 minutes'")
  assert.equal((await post({ body: 'Review required after rejection' })).status, 'PENDING')
  await role(writer, 'RESTRICTED')
  assert.equal((await post({ body: 'Restricted stays in review' })).status, 'PENDING')
  await role(writer, 'BLOCKED')
  await assert.rejects(post({ body: 'Blocked' }), /participant_blocked/)
  await role(writer, 'AUTO')
  await config({ rate_limit: 2 })
  await assert.rejects(post({ body: 'Rate limited before write' }), /comment_rate_limited/)
  const participants = await one("select list_comment_participants('ALL',1,'Visitor') as value")
  assert.equal(participants.participants[0].user_id, writer)
  await config({ enabled: false }, historical)
  assert.equal((await read({ artwork: historical })).enabled, false)
  await assert.rejects(post({ artwork: historical, body: 'Closed' }), /comments_disabled/)
  assert.ok((await query('select count(*)::int n from artwork_comment_audit'))[0].n >= 10)
})
