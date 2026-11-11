begin;

-- Old assets keep their recorded DPI; their exact placement cannot be reconstructed.
alter table public.print_asset_generations
  drop constraint print_asset_generations_effective_dpi_check,
  add constraint print_asset_generations_effective_dpi_check check (effective_dpi >= 0),
  add column layout jsonb;

create function public.commit_print_asset_layout(
  _artwork uuid, _request uuid, _by uuid, _new_print uuid, _size text, _edition text,
  _selected uuid, _replace boolean, _expected_path text,
  _master text, _preview text, _source jsonb, _border text, _dpi integer,
  _title text, _description text, _price numeric, _limit integer, _layout jsonb
) returns jsonb language plpgsql set search_path = public as $$
declare saved jsonb;
begin
  if jsonb_typeof(_layout) is distinct from 'object' then raise exception 'invalid_layout'; end if;
  saved := public.commit_print_asset_generation(
    _artwork, _request, _by, _new_print, _size, _edition, _selected, _replace, _expected_path,
    _master, _preview, _source, _border, _dpi, _title, _description, _price, _limit
  );
  if saved->>'production_file_path' = _master and saved->>'layout' is null then
    update public.print_asset_generations g set layout = _layout
    where g.request_id = _request and g.size = _size
    returning to_jsonb(g) into saved;
  end if;
  return saved;
end $$;

revoke all on function public.commit_print_asset_layout(
  uuid,uuid,uuid,uuid,text,text,uuid,boolean,text,text,text,jsonb,text,integer,text,text,numeric,integer,jsonb
) from public, anon, authenticated;
grant execute on function public.commit_print_asset_layout(
  uuid,uuid,uuid,uuid,text,text,uuid,boolean,text,text,text,jsonb,text,integer,text,text,numeric,integer,jsonb
) to service_role;

notify pgrst, 'reload schema';
commit;
