-- Read-only operator audit: replace TARGET_AUTH_USER_UUID once below.
-- Run in the production SQL editor as an authorized operator, NOT via the public API.
-- No login, token minting, browser session modification, writes or policy changes.
-- Database transaction role switching is allowed here, NOT inside SECURITY DEFINER.
begin transaction read only;

select to_regclass('public.user_roles') as separate_roles_table;
select schemaname, tablename, policyname, roles, cmd, qual
from pg_policies where schemaname = 'public'
  and tablename in ('profiles','artworks','orders','artwork_favorites','certificates','order_items','claim_groups');
select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('profiles','artworks','orders','artwork_favorites','certificates','order_items','claim_groups');

-- Supply only the verified profiles.id == auth.users.id association, never an email guess.
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', 'TARGET_AUTH_USER_UUID', 'role', 'authenticated',
  'email', (select email from auth.users where id = 'TARGET_AUTH_USER_UUID'::uuid)
)::text, true);
-- Legacy claims are also set because auth.uid()/auth.email() vary by installed version.
select set_config('request.jwt.claim.sub', current_setting('request.jwt.claims')::jsonb->>'sub', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.email', current_setting('request.jwt.claims')::jsonb->>'email', true);

-- Baseline is privileged/expected, not permission verification.
select 'EXPECTED (bypasses RLS)' as mode,
  (select count(*) from public.artworks where current_owner_id=auth.uid() or pending_owner_id=auth.uid()) as artworks,
  (select count(*) from public.certificates where owner_id=auth.uid()) as certificates,
  (select count(*) from public.artworks where pending_owner_id=auth.uid()) as pending_claims,
  (select count(*) from public.orders where buyer_email=auth.email()) as orders,
  (select count(*) from public.artwork_favorites where user_id=auth.uid()) as favorites;

set local role authenticated;
select current_user as database_role, auth.uid() as effective_auth_user;
-- SELECTs now execute with actual installed authenticated grants/RLS.
select 'PERMISSION (actual database grants/RLS)' as mode,
  (select count(*) from public.artworks where current_owner_id=auth.uid() or pending_owner_id=auth.uid()) as artworks,
  (select count(*) from public.certificates where owner_id=auth.uid()) as certificates,
  (select count(*) from public.artworks where pending_owner_id=auth.uid()) as pending_claims,
  (select count(*) from public.orders where buyer_email=auth.email()) as orders,
  (select count(*) from public.artwork_favorites where user_id=auth.uid()) as favorites;
select id, sku, ownership_status from public.artworks
where current_owner_id=auth.uid() or pending_owner_id=auth.uid();
select id, sku, status from public.certificates where owner_id=auth.uid();
select id, buyer_name, created_at from public.claim_groups
where id in (
 select claim_group_id from public.order_items
 where artwork_id in (select id from public.artworks where current_owner_id=auth.uid() or pending_owner_id=auth.uid())
    or order_id in (select id from public.orders where buyer_email=auth.email())
 union select claim_group_id from public.certificates where owner_id=auth.uid()
);
select id, artwork_id, event_type from public.artwork_provenance_public
where artwork_id in (select id from public.artworks where current_owner_id=auth.uid() or pending_owner_id=auth.uid());
rollback;
-- If a SELECT fails due to grants/schema, issue ROLLBACK manually. Failure is evidence,
-- never replace the permission result with the privileged baseline. This audit does not
-- reproduce JWT app_metadata/custom claims, Auth bans or private Storage download policies.
