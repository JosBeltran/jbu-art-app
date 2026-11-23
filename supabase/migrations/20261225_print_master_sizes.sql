begin;

alter table public.print_asset_generations drop constraint print_asset_generations_size_check;
alter table public.print_asset_generations add constraint print_asset_generations_size_check check (size in ('A0','A1','A2','A3','A4','30X40CM','30X30CM','12X16IN'));

create or replace function public.commit_print_asset_revision(
  _artwork uuid, _request uuid, _by uuid, _new_print uuid, _size text, _edition text,
  _selected uuid, _replace boolean, _expected_revision uuid,
  _master text, _preview text, _source jsonb, _border text, _dpi integer,
  _title text, _description text, _price numeric, _limit integer, _layout jsonb
) returns jsonb language plpgsql set search_path = public as $$
declare
  parent public.artworks;
  variant public.artwork_prints;
  edition_value public.artwork_prints;
  saved public.print_asset_generations;
  current_revision uuid;
  candidates uuid[];
begin
  if _request is null or _by is null or _new_print is null or _size is null or _size not in ('A0','A1','A2','A3','A4','30X40CM','30X30CM','12X16IN')
    or _edition is null or _edition not in ('OPEN','LIMITED') or (_price is not null and _price <= 0)
    or (_selected is null and _edition = 'LIMITED' and coalesce(_limit, 0) < 1)
    or _replace is null or _master = '' or nullif(_preview,'') is null
    or jsonb_typeof(_layout) is distinct from 'object'
    or _layout->>'algorithmVersion' is distinct from '1'
    or _layout->>'size' is distinct from _size
    or not (_layout ?& array['width','height','left','top','artworkWidth','artworkHeight',
      'paperWidthMm','paperHeightMm','outputDpi','minimumEffectiveDpi','marginsMm','paperType'])
    or _source->>'sha256' is null then
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
    and (upper(btrim(v.size)) ~ ('^' || _size || '([^A-Z0-9]|$)')
      or replace(regexp_replace(upper(btrim(v.size)),'[[:space:]]','','g'),'×','X')=_size);

  if _selected is null and coalesce(cardinality(candidates),0) > 0 then
    raise exception 'generation_conflict';
  end if;

  if _selected is not null then
    if not _replace or not coalesce(_selected = any(candidates), false) then
      raise exception 'generation_conflict';
    end if;
    select * into variant from public.artwork_prints where id = _selected for update;
    if not found or variant.artwork_id <> _artwork or variant.edition_type::text <> _edition
      or variant.finish::text <> 'FINE_ART' or not (upper(btrim(variant.size)) ~ ('^' || _size || '([^A-Z0-9]|$)')
        or replace(regexp_replace(upper(btrim(variant.size)),'[[:space:]]','','g'),'×','X')=_size) then
      raise exception 'generation_conflict';
    end if;
    select revision_id into current_revision from public.print_asset_generations
    where print_id = variant.id and is_current;
    if current_revision is distinct from _expected_revision then raise exception 'generation_conflict'; end if;

    -- Keep prior revisions usable for orders which already selected them.
    update public.print_asset_generations set is_current = false,
      production_status = case when production_status in ('PREVIEW_ONLY','MASTER_PENDING','MASTER_FAILED')
        then 'MASTER_STALE' else production_status end
    where print_id = variant.id and is_current;

    -- Commercial fields and variant identity are preserved, even when already sold.
    update public.artwork_prints set image_url = _preview, paper_type = _layout->>'paperType',
      print_gallery_image_id = null, print_provenance_image_id = null
    where id = variant.id;
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
      _layout->>'paperType', case when _edition = 'LIMITED' then _limit end, _preview
    ) returning * into variant;
  end if;

  insert into public.print_asset_generations (
    request_id, size, artwork_id, print_id, production_file_path, preview_image_url,
    source_image_ref, border_mode, effective_dpi, generated_by, layout, production_status, master_source_ref, master_approved_at
  ) values (_request, _size, _artwork, variant.id, _master, _preview, _source, _border, _dpi, _by, _layout,
    case when _master is null then 'PREVIEW_ONLY' else 'MASTER_READY' end,
    case when _master is not null then _source end, case when _master is not null then now() end)
  returning * into saved;
  return to_jsonb(saved);
end $$;

commit;
