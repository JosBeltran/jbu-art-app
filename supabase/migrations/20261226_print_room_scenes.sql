begin;

create table public.print_room_scenes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  description text not null default '',
  category text not null default '',
  license text not null check (length(trim(license)) between 1 and 500),
  object_path text not null unique check (object_path like 'print-room-scenes/%.webp'),
  width integer not null check (width between 1 and 3000),
  height integer not null check (height between 1 and 3000),
  placement jsonb not null check (jsonb_typeof(placement) = 'object'),
  family text references public.product_families(code),
  active boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

create table public.print_room_scene_targets (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.print_room_scenes(id) on delete cascade,
  artwork_id uuid references public.artworks(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  family_code text references public.product_families(code) on delete cascade,
  check (num_nonnulls(artwork_id,product_id,family_code) <= 1),
  unique nulls not distinct (artwork_id,product_id,family_code)
);
create index print_room_scene_target_scene on public.print_room_scene_targets(scene_id);

alter table public.print_room_scenes enable row level security;
alter table public.print_room_scene_targets enable row level security;
revoke all on public.print_room_scenes,public.print_room_scene_targets from anon,authenticated;
grant select,insert,update,delete on public.print_room_scenes,public.print_room_scene_targets to service_role;

commit;
