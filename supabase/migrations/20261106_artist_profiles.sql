-- Perfil editorial de artista (página About). Aditiva: no modifica datos existentes.
-- No duplica la entidad artista: la identidad sigue en public.profiles (auth) y
-- artworks.artist_profile_id sigue siendo el vínculo de autoría. Esta tabla solo
-- guarda el contenido editorial público de cada artista.
begin;

create table if not exists public.artist_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null,
  location_es text,
  location_en text,
  about_title_es text,
  about_title_en text,
  biography_es text,
  biography_en text,
  profile_image_url text,
  contact_email text check (contact_email is null or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  website_url text check (website_url is null or website_url ~ '^https?://'),
  instagram_url text check (instagram_url is null or instagram_url ~ '^https?://'),
  about_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) default auth.uid()
);

grant select on public.artist_profiles to anon, authenticated;
grant insert, update, delete on public.artist_profiles to authenticated;
grant all on public.artist_profiles to service_role;

alter table public.artist_profiles enable row level security;

-- Lectura pública solo de perfiles con About activado; escritura solo Admin (user_roles).
drop policy if exists "artist profiles public read" on public.artist_profiles;
create policy "artist profiles public read" on public.artist_profiles
  for select to anon, authenticated using (about_enabled);

drop policy if exists "artist profiles admin all" on public.artist_profiles;
create policy "artist profiles admin all" on public.artist_profiles
  for all to authenticated using (public.is_jbu_admin()) with check (public.is_jbu_admin());

-- Artista principal del sitio: se reutiliza la fila única de site_settings.
alter table public.site_settings add column if not exists primary_artist_profile_id uuid references public.profiles(id);

-- Contenido inicial del artista actual (solo si ese perfil existe en profiles).
insert into public.artist_profiles (
  profile_id, display_name, location_es, location_en,
  about_title_es, about_title_en, biography_es, biography_en,
  contact_email, about_enabled
)
select
  p.id,
  'Josué Beltrán Uresti',
  'Monterrey, Nuevo León, México',
  'Monterrey, Nuevo León, Mexico',
  'Sobre mi práctica',
  'About my practice',
  $bio$Nací en Sabinas Hidalgo, Nuevo León, México. Mi relación con las artes visuales comenzó desde muy joven, primero a través del dibujo y la pintura. Durante esos años participé en talleres locales y obtuve reconocimientos como el concurso nacional El Niño y la Mar, experiencias que despertaron una fascinación duradera por el color, la composición y la creación de imágenes.

Mi trayectoria profesional tomó después un camino distinto. Me formé como Ingeniero en Administración de Sistemas y desarrollé una carrera en tecnología, arquitectura de sistemas y transformación digital, trabajando con plataformas empresariales como Oracle y Salesforce en proyectos para distintas industrias.

Con el tiempo regresé de manera más consciente al trabajo de estudio. Hoy mi práctica artística se desarrolla entre la pintura, el relieve, la materia, la resina y la construcción de superficies. Me interesa explorar la tensión entre estructura e intuición: composiciones donde el color, las capas, las marcas y los accidentes conviven dentro de un orden deliberadamente inestable.

Mi trabajo parte muchas veces de impulsos primarios —trazos, símbolos, geometrías, referencias urbanas y formas casi tribales— que después son reconstruidos mediante superposición, deconstrucción y textura. No busco representar una realidad específica, sino construir objetos visuales capaces de generar presencia, energía y una experiencia física frente a la obra.

Cada pieza es parte de una exploración continua sobre materia, color, identidad y transformación.$bio$,
  $bioen$I was born in Sabinas Hidalgo, Nuevo León, Mexico. My connection with the visual arts began at an early age through drawing and painting. During those years, I attended local art workshops and received early recognition through initiatives such as the national El Niño y la Mar art competition, experiences that sparked a lasting fascination with color, composition, and image-making.

My professional path later moved in a different direction. I trained as a Systems Management Engineer and developed a career in technology, systems architecture, and digital transformation, working with enterprise platforms such as Oracle and Salesforce across multiple industries.

Over time, I returned to studio practice with a more deliberate focus. Today, my work moves between painting, relief, material experimentation, resin, and constructed surfaces. I am particularly interested in the tension between structure and intuition: compositions where color, layers, marks, and accidents coexist within a deliberately unstable order.

My work often begins with primary impulses—gestures, symbols, geometry, urban references, and almost tribal forms—which are then reconstructed through layering, deconstruction, and texture. Rather than representing a specific reality, I aim to create visual objects with physical presence, chromatic energy, and a strong material relationship with the viewer.

Each piece is part of an ongoing exploration of matter, color, identity, and transformation.$bioen$,
  'josue.beltran.u@gmail.com',
  true
from public.profiles p
where p.id = 'd6700fed-08c6-4434-9ebd-1c5bfb10bf24'
on conflict (profile_id) do nothing;

-- Marca el artista principal solo si aún no hay uno configurado.
update public.site_settings
set primary_artist_profile_id = 'd6700fed-08c6-4434-9ebd-1c5bfb10bf24'
where id = true
  and primary_artist_profile_id is null
  and exists (select 1 from public.profiles where id = 'd6700fed-08c6-4434-9ebd-1c5bfb10bf24');

commit;
