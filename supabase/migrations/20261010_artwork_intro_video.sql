-- Video de introducción cinemática por obra.
-- Reutiliza un video que ya existe en la galería (artwork_images con media_type = 'video');
-- no duplica archivos ni registros.
do $$
declare id_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into id_type
  from pg_attribute a
  where a.attrelid = 'public.artwork_images'::regclass and a.attname = 'id' and not a.attisdropped;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'artworks' and column_name = 'intro_video_id'
  ) then
    execute format(
      'alter table public.artworks add column intro_video_id %s references public.artwork_images(id) on delete set null',
      id_type
    );
  end if;
end $$;

-- Solo se permite elegir un video que pertenezca a la misma obra.
create or replace function public.validate_artwork_intro_video()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.intro_video_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.artwork_images i
    where i.id = new.intro_video_id
      and i.artwork_id = new.id
      and coalesce(i.media_type, 'image') = 'video'
  ) then
    raise exception 'El video de introducción debe ser un video de esta misma obra';
  end if;
  return new;
end;
$$;

drop trigger if exists artworks_validate_intro_video on public.artworks;
create trigger artworks_validate_intro_video
  before insert or update of intro_video_id on public.artworks
  for each row execute function public.validate_artwork_intro_video();
