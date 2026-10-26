import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
const migration=readFileSync(new URL('../supabase/migrations/20261105_legal_consent.sql',import.meta.url),'utf8')
const id='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222'
test('SQL enforces email acceptance, current version, immutable evidence and own-user access', async () => {
 const db=new PGlite()
 try {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_user_meta_data jsonb,raw_app_meta_data jsonb); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`)
 await db.exec(migration)
 await assert.rejects(db.exec(`INSERT INTO auth.users VALUES ('${id}','{}','{"provider":"email"}');`),/LEGAL_CONSENT_REQUIRED/)
 await assert.rejects(db.exec(`INSERT INTO auth.users VALUES ('${id}','{"legal_consent":{"accepted":true,"terms_version":"0.9","privacy_version":"1.0"}}','{"provider":"email"}');`),/LEGAL_CONSENT_REQUIRED/)
 await db.exec(`INSERT INTO auth.users VALUES ('${id}','{"legal_consent":{"accepted":true,"terms_version":"1.0","privacy_version":"1.0"}}','{"provider":"email"}'); INSERT INTO auth.users VALUES ('${other}','{}','{"provider":"google"}');`)
 const email=(await db.query(`SELECT * FROM public.user_legal_consents WHERE user_id='${id}'`)).rows[0]
 assert.equal(email.terms_version,'1.0'); assert.equal(email.privacy_version,'1.0'); assert.ok(email.terms_accepted_at); assert.ok(email.privacy_accepted_at)
 assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.user_legal_consents WHERE user_id='${other}'`)).rows[0].n,0)
 await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${other}',false);`)
 assert.equal((await db.query('SELECT * FROM public.user_legal_consents')).rows.length,0)
 const first=(await db.query('SELECT * FROM public.accept_current_legal_consent()')).rows[0]
 assert.equal(first.user_id,other); assert.equal(first.terms_version,'1.0'); assert.equal(first.privacy_version,'1.0')
 const second=(await db.query('SELECT * FROM public.accept_current_legal_consent()')).rows[0]
 assert.equal(String(first.terms_accepted_at),String(second.terms_accepted_at))
 assert.equal((await db.query('SELECT * FROM public.user_legal_consents')).rows.length,1)
 await assert.rejects(db.exec('UPDATE public.user_legal_consents SET terms_version=\'9.0\';'),/permission denied/)
 await db.exec('RESET ROLE; SET ROLE anon;')
 await assert.rejects(db.query('SELECT * FROM public.get_my_legal_consent()'),/permission denied/)
 } finally { await db.close() }
})
