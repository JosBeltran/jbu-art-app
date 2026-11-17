begin;

-- Ordered presentation-only images. The first entry is the primary image.
-- A null URL represents the existing variant preview, resolved at read time.
alter table public.artwork_prints
  add column gallery_images jsonb not null default '[]'::jsonb,
  add column gallery_revision integer not null default 0,
  add constraint artwork_prints_gallery_images_check check (
    jsonb_typeof(gallery_images) = 'array' and jsonb_array_length(gallery_images) <= 20
  );

-- These assets are served by the existing public bucket. Only the validated
-- server upload may create or change objects under the gallery prefixes.
create policy print_gallery_server_upload on storage.objects
  as restrictive for insert to anon, authenticated with check (
    bucket_id <> 'artworks' or
    (name not like 'artwork-images/print-galleries/%' and name not like 'optimized/artwork-images/print-galleries/%')
  );
create policy print_gallery_server_update on storage.objects
  as restrictive for update to anon, authenticated using (
    bucket_id <> 'artworks' or
    (name not like 'artwork-images/print-galleries/%' and name not like 'optimized/artwork-images/print-galleries/%')
  ) with check (
    bucket_id <> 'artworks' or
    (name not like 'artwork-images/print-galleries/%' and name not like 'optimized/artwork-images/print-galleries/%')
  );
create policy print_gallery_server_delete on storage.objects
  as restrictive for delete to anon, authenticated using (
    bucket_id <> 'artworks' or
    (name not like 'artwork-images/print-galleries/%' and name not like 'optimized/artwork-images/print-galleries/%')
  );

commit;
