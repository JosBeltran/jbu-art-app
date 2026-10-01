-- Sistema de medios por obra: amplía artwork_images (no crea una tabla nueva).
-- Seguro de ejecutar varias veces. No borra ni modifica imágenes existentes.

alter table public.artwork_images
  add column if not exists media_type text not null default 'image',
  add column if not exists poster_url text,
  add column if not exists alt_text text;

do $$ begin
  alter table public.artwork_images
    add constraint artwork_images_media_type_check check (media_type in ('image','video'));
exception when duplicate_object then null; end $$;

create index if not exists artwork_images_artwork_order_idx
  on public.artwork_images (artwork_id, display_order);

-- Copia artworks.video_url (si existe la columna y tiene valor) como elemento de video
-- al final de la galería. El campo original se conserva.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='artworks' and column_name='video_url') then
    execute $q$
      insert into public.artwork_images (artwork_id, image_url, display_order, media_type)
      select a.id, a.video_url,
             coalesce((select max(i.display_order) + 1 from public.artwork_images i where i.artwork_id = a.id), 0),
             'video'
      from public.artworks a
      where coalesce(trim(a.video_url), '') <> ''
        and not exists (select 1 from public.artwork_images i
                        where i.artwork_id = a.id and i.image_url = a.video_url)
    $q$;
  end if;
end $$;
