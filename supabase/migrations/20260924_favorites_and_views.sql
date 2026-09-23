-- Favoritos por obra y contador de vistas.
-- Idempotente: seguro de re-ejecutar.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Columnas de conteo en artworks
-- ---------------------------------------------------------------------
alter table public.artworks
  add column if not exists views_count integer not null default 0,
  add column if not exists favorites_count integer not null default 0;

-- ---------------------------------------------------------------------
-- Tabla de favoritos
-- ---------------------------------------------------------------------
create table if not exists public.artwork_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artwork_id uuid not null references public.artworks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, artwork_id)
);

create index if not exists artwork_favorites_artwork_id_idx on public.artwork_favorites(artwork_id);
create index if not exists artwork_favorites_user_id_idx on public.artwork_favorites(user_id);

alter table public.artwork_favorites enable row level security;

drop policy if exists "artwork_favorites_select_own" on public.artwork_favorites;
create policy "artwork_favorites_select_own"
  on public.artwork_favorites for select
  using (auth.uid() = user_id);

drop policy if exists "artwork_favorites_insert_own" on public.artwork_favorites;
create policy "artwork_favorites_insert_own"
  on public.artwork_favorites for insert
  with check (auth.uid() = user_id);

drop policy if exists "artwork_favorites_delete_own" on public.artwork_favorites;
create policy "artwork_favorites_delete_own"
  on public.artwork_favorites for delete
  using (auth.uid() = user_id);

grant select, insert, delete on public.artwork_favorites to authenticated;
grant all on public.artwork_favorites to service_role;

-- ---------------------------------------------------------------------
-- Backfill de favorites_count a partir de filas existentes
-- ---------------------------------------------------------------------
update public.artworks a
set favorites_count = coalesce(f.cnt, 0)
from (
  select artwork_id, count(*) as cnt
  from public.artwork_favorites
  group by artwork_id
) f
where f.artwork_id = a.id;

-- ---------------------------------------------------------------------
-- Trigger: mantiene artworks.favorites_count sincronizado
-- ---------------------------------------------------------------------
create or replace function public.handle_artwork_favorite_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.artworks
      set favorites_count = favorites_count + 1
      where id = new.artwork_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.artworks
      set favorites_count = greatest(favorites_count - 1, 0)
      where id = old.artwork_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists artwork_favorites_after_insert on public.artwork_favorites;
create trigger artwork_favorites_after_insert
  after insert on public.artwork_favorites
  for each row execute function public.handle_artwork_favorite_change();

drop trigger if exists artwork_favorites_after_delete on public.artwork_favorites;
create trigger artwork_favorites_after_delete
  after delete on public.artwork_favorites
  for each row execute function public.handle_artwork_favorite_change();

-- ---------------------------------------------------------------------
-- Función: incrementa el contador de vistas de una obra
-- ---------------------------------------------------------------------
create or replace function public.increment_artwork_view(target_artwork_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  update public.artworks
    set views_count = views_count + 1
    where id = target_artwork_id
    returning views_count into new_count;

  return new_count;
end;
$$;

grant execute on function public.increment_artwork_view(uuid) to anon, authenticated;
