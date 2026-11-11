-- Meta/Facebook post association for artworks; never store access tokens.
begin;
create table if not exists public.artwork_facebook_posts (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references public.artworks(id) on delete cascade,
  page_id text not null,
  facebook_post_id text not null unique,
  message text not null,
  permalink text,
  state text not null check (state in ('UNPUBLISHED', 'PUBLISHED')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists artwork_facebook_posts_artwork_created_idx
  on public.artwork_facebook_posts (artwork_id, created_at desc);
alter table public.artwork_facebook_posts enable row level security;
-- No browser access, including for admins: use admin-checked server API.
revoke all on public.artwork_facebook_posts from anon, authenticated;
grant all on public.artwork_facebook_posts to service_role;
commit;
