begin;

create index if not exists artworks_inventory_created_idx on public.artworks (created_at desc nulls last, id);
create index if not exists artwork_prints_inventory_artwork_idx on public.artwork_prints (artwork_id);
create index if not exists order_items_inventory_artwork_idx on public.order_items (artwork_id);
create index if not exists artwork_offers_inventory_artwork_idx on public.artwork_offers (artwork_id);

create function public.admin_artwork_inventory_status_editable(a public.artworks)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select not (
    coalesce(a.is_historical_version, false) or (a.version_kind is not distinct from 'SUCCESSOR' and a.version_published_at is null)
    or a.physical_edition_type is distinct from 'UNIQUE'
    or coalesce(a.availability_status::text, '') not in ('AVAILABLE', 'NOT_FOR_SALE')
    or coalesce(a.ownership_status::text, '') not in ('AVAILABLE', 'NOT_FOR_SALE')
    or a.current_owner_id is not null or a.pending_owner_id is not null or a.reserved_order_id is not null
    or a.certificate_hash is not null or a.certificate_issued_at is not null
    or a.claim_token is not null
    or exists (select 1 from auctions x where x.artwork_id = a.id and
      (x.status::text in ('UPCOMING','LIVE') or (x.status::text = 'SOLD' and x.payment_status = 'PENDING')))
    or exists (select 1 from artwork_offers x where x.artwork_id = a.id and
      x.status::text = 'ACCEPTED' and x.payment_status = 'PENDING')
    or exists (select 1 from order_items i join orders o on o.id = i.order_id
      where i.artwork_id = a.id and coalesce(i.product_type_snapshot, 'ORIGINAL') <> 'PRINT'
        and o.status::text is distinct from 'CANCELLED')
  )
$$;

revoke all on function public.admin_artwork_inventory_status_editable(public.artworks) from public, anon, authenticated;
grant execute on function public.admin_artwork_inventory_status_editable(public.artworks) to service_role;

create function public.admin_artwork_inventory(
  _search text, _filters jsonb, _sort text, _descending boolean,
  _page integer, _size integer, _include_facets boolean
) returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare
  result jsonb;
  sort_column text := case when _sort in ('title','sku','series','year','medium','status',
    'availability','ownership','price','created_at','updated_at','owner','prints')
    then _sort else 'created_at' end;
  ordering text;
begin
  if _page not between 1 and 1000000 or _size not in (25, 50, 100) then
    raise exception 'invalid_inventory_page';
  end if;
  ordering := format('%I %s nulls last, id asc', sort_column, case when _descending then 'desc' else 'asc' end);
  execute format($query$
    with studio_prints as materialized (
      select rel.artwork_id, count(*) as variants,
        array_agg(v.replaces_print_id) filter (where v.replaces_print_id is not null) as replacements
      from public_fine_art_variant_ids(null, null) supported
      join product_variants v on v.id = supported.id
      join artwork_products rel on rel.product_id = v.product_id and rel.is_primary
      group by rel.artwork_id
    ), inventory as (
      select a.id, a.title, a.title_en, a.sku, a.primary_image_url,
        coalesce(nullif(s.title, ''), nullif(a.series, '')) as series,
        s.name_es as series_es, s.name_en as series_en,
        a.year, nullif(a.medium, '') as medium, a.base_price_mxn as price,
        a.status::text as status, a.availability_status::text as availability,
        a.ownership_status::text as ownership, a.physical_edition_type as edition,
        p.full_name as owner, p.email as owner_email, a.claim_token as token,
        case when a.is_historical_version then 'historical'
             when a.version_kind = 'SUCCESSOR' and a.version_published_at is null then 'draft'
             else 'current' end as version,
        a.version_parent_id, a.version_kind,
        coalesce(a.allows_prints, false) as allows_prints,
        case when a.allows_prints is true then
          coalesce(studio.variants, 0)
          + (select count(*) from artwork_prints v where v.artwork_id = a.id
            and not coalesce(v.id = any(studio.replacements), false)
            and v.is_active is true and v.is_available is distinct from false and v.price > 0
            and (v.edition_type::text = 'OPEN' or
              (v.edition_type::text in ('LIMITED', 'LIMITADA') and v.max_edition_size > coalesce(v.prints_sold, 0))))
          + case when coalesce(studio.variants, 0) = 0 and a.print_price_mxn > 0 and not exists (select 1 from artwork_prints v where v.artwork_id = a.id)
            and (coalesce(a.print_type::text, 'OPEN') not in ('LIMITED', 'LIMITADA') or
              a.print_edition_size > coalesce(a.prints_sold, 0)) then 1 else 0 end
        else 0 end as prints,
        a.created_at, a.updated_at
      from artworks a
      left join series s on s.id = a.series_id
      left join profiles p on p.id = a.current_owner_id
      left join studio_prints studio on studio.artwork_id = a.id
    ), matched as (
      select i.* from inventory i
      where ($1 = '' or exists (
        select 1 from unnest(array[i.title::text,i.title_en::text,i.sku::text,i.series::text,
          i.series_es::text,i.series_en::text,i.owner::text,i.owner_email::text,i.token::text]) field
        where strpos(translate(lower(field), 'áéíóúüñàèìòùâêîôûäëïöÿç', 'aeiouunaeiouaeiouaeioyc'), $1) > 0
      ))
      and not exists (
        select 1 from jsonb_each($2) f
        where jsonb_array_length(f.value) > 0
        and not (f.value ? coalesce(case f.key
          when 'series' then i.series::text when 'status' then i.status
          when 'availability' then i.availability when 'year' then i.year::text
          when 'medium' then i.medium::text when 'version' then i.version
          when 'edition' then i.edition when 'ownership' then i.ownership
          when 'prints' then (i.prints > 0)::text end, ''))
      )
    ), page_rows as (
      select * from matched order by %1$s limit $3 offset $4
    )
    select jsonb_build_object(
      'total', (select count(*) from matched),
      'rows', (select coalesce(jsonb_agg((to_jsonb(r) - 'series_es' - 'series_en') || jsonb_build_object(
        'public', exists(select 1 from artworks_discoverable d where d.id = r.id),
        'can_change_status', exists(select 1 from artworks a where a.id = r.id and admin_artwork_inventory_status_editable(a)),
        'has_versions', r.version_parent_id is not null or exists(select 1 from artworks a where a.version_parent_id = r.id)
      ) order by %1$s), '[]'::jsonb) from page_rows r),
      'facets', case when $5 then (select jsonb_object_agg(key, options) from (
        select key, jsonb_agg(distinct value order by value) as options
        from inventory i cross join lateral (values
          ('series', i.series::text), ('year', i.year::text), ('medium', i.medium::text),
          ('status', i.status), ('availability', i.availability), ('ownership', i.ownership),
          ('version', i.version), ('edition', i.edition), ('prints', (i.prints > 0)::text)
        ) f(key, value) where value is not null group by key
      ) options_by_key) end
    )
  $query$, ordering)
  into result using coalesce(_search, ''), coalesce(_filters, '{}'::jsonb),
    _size, (_page::bigint - 1) * _size, _include_facets;
  return result;
end;
$$;

-- Only reversible availability changes are automated. Existing sale and
-- certificate guards continue to run on the locked row.
create function public.admin_change_artwork_inventory_availability(
  _ids uuid[], _target public.availability_status, _apply boolean
) returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
  artwork_id uuid;
  a public.artworks;
  outcome text;
  reason text;
  results jsonb := '[]'::jsonb;
begin
  if coalesce(cardinality(_ids), 0) not between 1 and 100
     or _target is null or _target not in ('AVAILABLE', 'NOT_FOR_SALE') or _apply is null then
    raise exception 'invalid_inventory_transition';
  end if;
  -- Serializes validation against concurrent writes to the workflow tables,
  -- including changes to existing auctions, offers and orders.
  if _apply then
    lock table public.auctions, public.artwork_offers, public.orders, public.order_items in share mode nowait;
  end if;
  for artwork_id in select distinct unnest(_ids) order by 1 loop
    outcome := 'failed';
    reason := null;
    begin
      if _apply then
        select * into a from artworks where id = artwork_id for update nowait;
      else
        select * into a from artworks where id = artwork_id;
      end if;
      if not found then reason := 'not_found';
      elsif a.availability_status = _target then outcome := 'skipped'; reason := 'already_set';
      elsif not admin_artwork_inventory_status_editable(a)
        then outcome := 'skipped'; reason := 'protected_workflow';
      elsif _target = 'AVAILABLE' and (a.status::text is distinct from 'AVAILABLE'
        or coalesce(a.calculated_price_mxn, a.base_price_mxn, 0) <= 0
        or coalesce(a.price_display_mode::text, 'SHOW_PRICE') <> 'SHOW_PRICE') then
        outcome := 'skipped'; reason := 'not_ready_for_sale';
      elsif not _apply then outcome := 'eligible';
      else
        update artworks set availability_status = _target, updated_at = now()
          where id = artwork_id returning availability_status into a.availability_status;
        if found and a.availability_status = _target then outcome := 'successful';
        else reason := 'write_rejected'; end if;
      end if;
    exception when lock_not_available then
      reason := 'record_busy';
    when integrity_constraint_violation or raise_exception then
      reason := 'write_rejected';
    end;
    results := results || jsonb_build_array(jsonb_build_object(
      'id', artwork_id, 'outcome', outcome, 'reason', reason));
  end loop;
  return results;
end;
$$;

revoke all on function public.admin_artwork_inventory(text,jsonb,text,boolean,integer,integer,boolean),
  public.admin_change_artwork_inventory_availability(uuid[],public.availability_status,boolean)
  from public, anon, authenticated;
grant execute on function public.admin_artwork_inventory(text,jsonb,text,boolean,integer,integer,boolean),
  public.admin_change_artwork_inventory_availability(uuid[],public.availability_status,boolean)
  to service_role;

commit;
