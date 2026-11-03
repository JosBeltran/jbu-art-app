-- JBU · Provenance visual history
-- Permite asociar 0..N imágenes a cada evento de procedencia sin mezclar estas
-- imágenes históricas con la galería principal del artwork.

create table if not exists public.provenance_event_images (
  id uuid primary key default gen_random_uuid(),
  provenance_event_id uuid not null references public.provenance_events(id) on delete cascade,
  artwork_id uuid not null references public.artworks(id) on delete cascade,
  image_url text not null,
  caption_es text,
  caption_en text,
  stage_label text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists provenance_event_images_event_idx
  on public.provenance_event_images(provenance_event_id, display_order, created_at);
create index if not exists provenance_event_images_artwork_idx
  on public.provenance_event_images(artwork_id, provenance_event_id);

alter table public.provenance_event_images enable row level security;
revoke all on public.provenance_event_images from anon, authenticated;
grant all on public.provenance_event_images to service_role;

-- Vista pública segura: solo imágenes pertenecientes a eventos públicos que ya
-- formarían parte de la cronología pública.
drop view if exists public.provenance_event_images_public;
create view public.provenance_event_images_public as
select i.id, i.provenance_event_id, i.artwork_id, i.image_url,
       i.caption_es, i.caption_en, i.stage_label, i.display_order, i.created_at
  from public.provenance_event_images i
  join public.provenance_events p on p.id = i.provenance_event_id
 where p.visibility = 'PUBLIC'
   and p.event_type not in ('PRICE_CHANGED','IMAGE_UPDATED','SEO_UPDATED','ARCHIVED','WITHDRAWN');
grant select on public.provenance_event_images_public to anon, authenticated;

-- Los registros antiguos que ya usaban primary_image_url se conservan y se
-- convierten en la primera imagen estructurada del evento.
insert into public.provenance_event_images(
  provenance_event_id, artwork_id, image_url, display_order
)
select p.id, p.artwork_id, p.primary_image_url, 0
  from public.provenance_events p
 where nullif(trim(coalesce(p.primary_image_url, '')), '') is not null
   and not exists (
     select 1 from public.provenance_event_images i
      where i.provenance_event_id = p.id
        and i.image_url = p.primary_image_url
   );
