-- Series como unidad editorial y de lanzamiento de la portada.
-- Segura de repetir: solo agrega columnas, reglas e índices.

alter table public.series
  add column if not exists home_featured boolean not null default false,
  add column if not exists home_order integer not null default 0,
  add column if not exists editorial_status text not null default 'active',
  add column if not exists main_artwork_id uuid references public.artworks(id) on delete set null,
  add column if not exists launch_date timestamptz,
  add column if not exists auto_launch boolean not null default false,
  add column if not exists home_headline text,
  add column if not exists home_subtitle text,
  add column if not exists home_description text,
  add column if not exists teaser_image_url text,
  add column if not exists teaser_video_url text,
  add column if not exists cta_label text,
  add column if not exists cta_url text,
  add column if not exists show_countdown boolean not null default false;

do $$ begin
  alter table public.series add constraint series_editorial_status_check
    check (editorial_status in ('active','coming_soon','outlet','archived'));
exception when duplicate_object then null; end $$;

create index if not exists series_home_order_idx on public.series (home_order);

-- Ligar por id las obras que hoy solo tienen el nombre de la serie
update public.artworks a
   set series_id = s.id
  from public.series s
 where a.series_id is null
   and a.series is not null
   and upper(trim(a.series)) = upper(trim(s.title));

-- La obra principal debe pertenecer a la misma serie
create or replace function public.validate_series_main_artwork()
returns trigger language plpgsql as $$
begin
  if new.main_artwork_id is null then return new; end if;
  if not exists (
    select 1 from public.artworks a
     where a.id = new.main_artwork_id
       and (a.series_id = new.id or upper(trim(coalesce(a.series,''))) = upper(trim(new.title)))
  ) then
    raise exception 'La obra principal debe pertenecer a esta serie';
  end if;
  return new;
end $$;

drop trigger if exists series_validate_main_artwork on public.series;
create trigger series_validate_main_artwork
  before insert or update of main_artwork_id, title on public.series
  for each row execute function public.validate_series_main_artwork();

-- Permisos: lectura pública, escritura solo admin
grant select on public.series to anon, authenticated;
grant insert, update, delete on public.series to authenticated;
grant all on public.series to service_role;
alter table public.series enable row level security;

drop policy if exists "series public read" on public.series;
create policy "series public read" on public.series for select using (true);

drop policy if exists "series admin write" on public.series;
create policy "series admin write" on public.series
  for all to authenticated
  using (public.is_jbu_admin()) with check (public.is_jbu_admin());
