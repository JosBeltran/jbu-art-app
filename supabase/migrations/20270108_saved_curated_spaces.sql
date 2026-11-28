begin;

create table public.saved_curated_spaces (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  composition jsonb not null check (
    jsonb_typeof(composition) = 'object' and (composition->>'version') is not distinct from '1'
    and octet_length(composition::text) <= 65536
  ),
  photo_data text check (
    photo_data is null or (
      octet_length(photo_data) <= 4194330
      and photo_data like 'data:image/jpeg;base64,%'
    )
  ),
  updated_at timestamptz not null default now()
);

create index saved_curated_spaces_owner_updated
  on public.saved_curated_spaces (owner_id, updated_at desc);

alter table public.saved_curated_spaces enable row level security;
revoke all on public.saved_curated_spaces from public, anon, authenticated;
grant select, insert, update on public.saved_curated_spaces to authenticated;
grant select on public.saved_curated_spaces to service_role;
create policy "Read own curated spaces" on public.saved_curated_spaces
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "Create own curated spaces" on public.saved_curated_spaces
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Edit own curated spaces" on public.saved_curated_spaces
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

commit;
