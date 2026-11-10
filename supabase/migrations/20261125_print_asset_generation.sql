begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('print-masters', 'print-masters', false, 52428800,
  array['image/jpeg','image/png','image/webp','image/tiff'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Guard against any existing broad storage.objects policy. The service role signs
-- narrowly scoped staging uploads and short-lived admin downloads.
create policy print_masters_private on storage.objects as restrictive
  for all to anon, authenticated using (bucket_id <> 'print-masters')
  with check (bucket_id <> 'print-masters');

-- A newly generated draft can have a genuinely unset price. Keep the price
-- requirement for active rows without rewriting existing print records.
alter table public.artwork_prints alter column price drop not null;
alter table public.artwork_prints add constraint print_active_price_required
  check (price is not null or is_active is not true) not valid;

-- Private master and source references must stay out of existing public
-- artwork_prints projections, including legacy wildcard embeds.
create table public.print_asset_generations (
  request_id uuid not null,
  size text not null check (size in ('A2','A1')),
  artwork_id uuid not null references public.artworks(id) on delete cascade,
  print_id uuid not null references public.artwork_prints(id) on delete cascade,
  production_file_path text not null unique,
  preview_image_url text not null,
  source_image_ref jsonb not null,
  border_mode text not null check (border_mode in ('fit','margin')),
  effective_dpi integer not null check (effective_dpi >= 240),
  generation_status text not null default 'READY' check (generation_status = 'READY'),
  generated_by uuid not null,
  generated_at timestamptz not null default now(),
  is_current boolean not null default true,
  primary key (request_id, size)
);
create unique index print_asset_current on public.print_asset_generations (print_id) where is_current;
create index print_asset_artwork_idx on public.print_asset_generations (artwork_id) where is_current;
alter table public.print_asset_generations enable row level security;
revoke all on public.print_asset_generations from public, anon, authenticated;
grant select, insert, update, delete on public.print_asset_generations to service_role;

create function public.commit_print_asset_generation(
  _artwork uuid, _request uuid, _by uuid, _new_print uuid, _size text, _edition text,
  _selected uuid, _replace boolean, _expected_path text,
  _master text, _preview text, _source jsonb, _border text, _dpi integer,
  _title text, _description text, _price numeric, _limit integer
) returns jsonb language plpgsql set search_path = public as $$
declare
  parent public.artworks;
  variant public.artwork_prints;
  edition_value public.artwork_prints;
  saved public.print_asset_generations;
  current_path text;
  candidates uuid[];
begin
  if _request is null or _by is null or _new_print is null or _size is null or _size not in ('A2','A1')
    or _edition is null or _edition not in ('OPEN','LIMITED') or (_price is not null and _price <= 0)
    or (_selected is null and _edition = 'LIMITED' and coalesce(_limit, 0) < 1)
    or _replace is null or nullif(_master,'') is null or nullif(_preview,'') is null then
    raise exception 'invalid_options';
  end if;

  -- The normal admin print manager uses the same artwork-row lock.
  select * into parent from public.artworks where id = _artwork for update;
  if not found then raise exception 'artwork_not_found'; end if;
  select * into saved from public.print_asset_generations where request_id = _request and size = _size;
  if found then
    if saved.artwork_id <> _artwork or saved.generated_by <> _by then raise exception 'generation_conflict'; end if;
    return to_jsonb(saved);
  end if;

  -- Match legacy size labels such as "A2 · 42 × 59.4 cm" as well as bare A2.
  select array_agg(v.id order by v.id) into candidates from public.artwork_prints v
  where v.artwork_id = _artwork and v.edition_type::text = _edition and v.finish::text = 'FINE_ART'
    and upper(btrim(v.size)) ~ ('^' || _size || '([^A-Z0-9]|$)');

  if _selected is null and coalesce(cardinality(candidates),0) > 0 then
    raise exception 'generation_conflict';
  end if;

  if _selected is not null then
    if not _replace or not coalesce(_selected = any(candidates), false) then
      raise exception 'generation_conflict';
    end if;
    select * into variant from public.artwork_prints where id = _selected for update;
    if not found or variant.artwork_id <> _artwork or variant.edition_type::text <> _edition
      or variant.finish::text <> 'FINE_ART' or not upper(btrim(variant.size)) ~ ('^' || _size || '([^A-Z0-9]|$)') then
      raise exception 'generation_conflict';
    end if;
    select production_file_path into current_path from public.print_asset_generations
    where print_id = variant.id and is_current;
    if current_path is distinct from _expected_path then raise exception 'generation_conflict'; end if;

    -- Commercial fields and variant identity are preserved, even when already sold.
    update public.artwork_prints set image_url = _preview,
      print_gallery_image_id = null, print_provenance_image_id = null
    where id = variant.id;
    update public.print_asset_generations set is_current = false where print_id = variant.id and is_current;
  else
    edition_value := jsonb_populate_record(null::public.artwork_prints, jsonb_build_object('edition_type', _edition));
    insert into public.artwork_prints (
      id, artwork_id, size, finish, edition_type, price, currency, is_active, title, title_en,
      description, description_en, paper_type, max_edition_size, image_url
    ) values (
      _new_print, _artwork, _size, 'FINE_ART', edition_value.edition_type,
      _price, 'MXN', false,
      coalesce(nullif(btrim(_title),''), left(parent.title, 194) || ' · ' || _size),
      case when nullif(btrim(_title),'') is null and nullif(parent.title_en,'') is not null
        then left(parent.title_en,194) || ' · ' || _size end,
      coalesce(nullif(btrim(_description),''), parent.description),
      case when nullif(btrim(_description),'') is null then parent.description_en end,
      'Prodigi Enhanced Matte Art 200 gsm', case when _edition = 'LIMITED' then _limit end, _preview
    ) returning * into variant;
  end if;

  insert into public.print_asset_generations (
    request_id, size, artwork_id, print_id, production_file_path, preview_image_url,
    source_image_ref, border_mode, effective_dpi, generated_by
  ) values (_request, _size, _artwork, variant.id, _master, _preview, _source, _border, _dpi, _by)
  returning * into saved;
  return to_jsonb(saved);
end $$;

revoke all on function public.commit_print_asset_generation(
  uuid,uuid,uuid,uuid,text,text,uuid,boolean,text,text,text,jsonb,text,integer,text,text,numeric,integer
) from public, anon, authenticated;
grant execute on function public.commit_print_asset_generation(
  uuid,uuid,uuid,uuid,text,text,uuid,boolean,text,text,text,jsonb,text,integer,text,text,numeric,integer
) to service_role;

notify pgrst, 'reload schema';
commit;
