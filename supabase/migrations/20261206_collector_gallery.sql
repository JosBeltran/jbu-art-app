begin;

create table public.collector_gallery_entries (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('HISTORICAL','LEGACY','COLLECTOR')),
  legacy_path text unique,
  legacy_revision text,
  submitter_id uuid references auth.users(id) on delete set null,
  artwork_id uuid references public.artworks(id) on delete set null,
  caption_es text not null default '' check (length(caption_es) <= 300),
  caption_en text not null default '' check (length(caption_en) <= 300),
  category text not null default 'private' check (category in ('private','studio','public')),
  display_order integer not null default 0,
  featured boolean not null default false,
  visible boolean not null default false,
  status text not null check (status in ('DRAFT','PENDING','APPROVED','REJECTED','HIDDEN','WITHDRAWN','REMOVED')),
  consent_at timestamptz,
  consent_version text,
  withdrawn_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((source = 'LEGACY') = (legacy_path is not null and legacy_revision is not null)),
  check (source <> 'COLLECTOR' or (consent_at is not null and consent_version is not null)),
  check (status <> 'APPROVED' or approved_at is not null),
  check (not visible or (status = 'APPROVED' and withdrawn_at is null))
);

create index collector_gallery_public_idx on public.collector_gallery_entries
  (featured desc, display_order, created_at, id)
  where visible and status = 'APPROVED';
create index collector_gallery_submitter_idx on public.collector_gallery_entries
  (submitter_id, created_at desc);

create table public.collector_gallery_audit (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.collector_gallery_entries(id),
  actor_id uuid references auth.users(id) on delete set null,
  status text not null,
  visible boolean not null,
  recorded_at timestamptz not null default now()
);

create function public.audit_collector_gallery() returns trigger
language plpgsql set search_path = '' as $$
begin
  insert into public.collector_gallery_audit (entry_id, actor_id, status, visible)
    values (new.id, new.actor_id, new.status, new.visible);
  return new;
end;
$$;
create trigger collector_gallery_audit_changes
  after insert or update on public.collector_gallery_entries
  for each row execute function public.audit_collector_gallery();

create table public.collector_gallery_upload_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  attempts integer not null
);

create function public.consume_collector_gallery_upload(p_user uuid) returns boolean
language sql set search_path = '' as $$
  with slot as (
    insert into public.collector_gallery_upload_limits as limits values (p_user, now(), 1)
    on conflict (user_id) do update set
      window_start = case when limits.window_start <= now() - interval '1 hour' then now() else limits.window_start end,
      attempts = case when limits.window_start <= now() - interval '1 hour' then 1 else limits.attempts + 1 end
    where limits.window_start <= now() - interval '1 hour' or limits.attempts < 5
    returning 1
  )
  select exists (select 1 from slot);
$$;

create function public.collector_gallery_owned_artworks(p_user uuid)
returns table(id uuid, title text, title_en text)
language sql stable set search_path = '' as $
  select a.id, a.title, a.title_en from public.artworks a
  where a.current_owner_id = p_user
  union
  select a.id, a.title, a.title_en from public.collector_physical_editions(p_user) edition
  join public.artworks a on a.sku = edition.sku;
$;
revoke all on function public.collector_gallery_owned_artworks(uuid) from public, anon, authenticated;
grant execute on function public.collector_gallery_owned_artworks(uuid) to service_role;

alter table public.collector_gallery_entries enable row level security;
alter table public.collector_gallery_audit enable row level security;
alter table public.collector_gallery_upload_limits enable row level security;
revoke all on public.collector_gallery_entries, public.collector_gallery_audit,
  public.collector_gallery_upload_limits from public, anon, authenticated;
grant select, insert, update on public.collector_gallery_entries to service_role;
grant select, insert on public.collector_gallery_audit to service_role;
grant select, insert, update on public.collector_gallery_upload_limits to service_role;
revoke all on function public.consume_collector_gallery_upload(uuid) from public, anon, authenticated;
grant execute on function public.consume_collector_gallery_upload(uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('collector-gallery', 'collector-gallery', false, 8388608, array['image/jpeg','image/webp'])
on conflict (id) do nothing;

-- A pre-existing permissive policy on storage.objects cannot grant direct browser access here.
create policy collector_gallery_server_only on storage.objects as restrictive
  for all to anon, authenticated using (bucket_id <> 'collector-gallery')
  with check (bucket_id <> 'collector-gallery');

commit;
