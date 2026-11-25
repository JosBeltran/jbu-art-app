begin;

-- The normalized catalog also covers final uploaded masters outside the generator presets.
alter table public.print_asset_generations drop constraint print_asset_generations_size_check;
alter table public.print_asset_generations add constraint print_asset_generations_size_check
  check (size in ('A5','A6','A2','A1','A0','A3','A4','30X40CM','30X30CM','12X16IN','20X30CM','30X45CM','30X50CM','40X50CM','40X60CM','50X70CM','50X75CM','60X80CM','60X90CM','70X100CM','8X10IN','16X20IN','18X24IN','20X30IN','24X36IN'));

create function public.attach_artwork_print_master(
  _print uuid,_expected uuid,_size text,_path text,_request uuid,_by uuid,_sha text,_layout jsonb,_dpi integer
) returns jsonb language plpgsql set search_path=public as $$
declare p artwork_prints; g print_asset_generations; preview text; revision uuid; source jsonb;
begin
  if _by is null or _request is null or _dpi is null or _dpi<150 or _sha is null or _sha !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(_layout) is distinct from 'object' or _layout->>'algorithmVersion' is distinct from '2'
    or _layout->>'size' is distinct from _size then raise exception 'invalid_print_size'; end if;
  select * into p from artwork_prints where id=_print for update;
  if not found or p.size_code is distinct from _size then raise exception 'invalid_print_size'; end if;
  if _path not like 'attached/'||p.artwork_id::text||'/'||p.id::text||'/'||_request::text||'/master.%'
    then raise exception 'invalid_print_size'; end if;
  select * into g from print_asset_generations where print_id=p.id and is_current for update;
  if g.production_file_path is not null then
    if g.master_source_ref->>'uploadId'=_request::text and g.master_source_ref->>'sha256'=_sha
      then return jsonb_build_object('printId',p.id,'revisionId',g.revision_id); end if;
    raise exception 'master_already_exists';
  end if;
  if g.revision_id is distinct from _expected then raise exception 'layout_changed'; end if;
  if g.production_status='MASTER_GENERATING' and g.master_lease_until>now() then raise exception 'master_busy'; end if;
  source:=jsonb_build_object('kind','uploaded_master','uploadId',_request,'sha256',_sha,
    'effectiveDpi',least(_dpi,coalesce((g.layout->>'effectiveDpi')::numeric,_dpi)));
  if g.revision_id is not null then
    -- Filling a pending master changes neither the print ID nor the approved revision.
    update print_asset_generations set production_file_path=_path,production_status='MASTER_READY',
      master_source_ref=source,master_approved_at=now(),master_lease=null,master_lease_until=null,master_error=null
      where revision_id=g.revision_id;
    revision:=g.revision_id;
  else
    preview:=nullif(p.image_url,'');
    if preview is null and p.print_gallery_image_id is not null then
      select image_url into preview from artwork_images where id=p.print_gallery_image_id and artwork_id=p.artwork_id;
    end if;
    if preview is null and p.print_provenance_image_id is not null then
      select image_url into preview from provenance_event_images_public where id=p.print_provenance_image_id and artwork_id=p.artwork_id;
    end if;
    if preview is null then select primary_image_url into preview from artworks where id=p.artwork_id; end if;
    if nullif(preview,'') is null then raise exception 'source_unavailable'; end if;
    insert into print_asset_generations(request_id,size,artwork_id,print_id,production_file_path,preview_image_url,
      source_image_ref,border_mode,effective_dpi,generated_by,layout,production_status,master_source_ref,master_approved_at)
    values(_request,_size,p.artwork_id,p.id,_path,preview,source,'fit',_dpi,_by,_layout,'MASTER_READY',source,now())
    returning revision_id into revision;
  end if;
  return jsonb_build_object('printId',p.id,'revisionId',revision);
end $$;
revoke all on function public.attach_artwork_print_master(uuid,uuid,text,text,uuid,uuid,text,jsonb,integer)
from public,anon,authenticated;
grant execute on function public.attach_artwork_print_master(uuid,uuid,text,text,uuid,uuid,text,jsonb,integer) to service_role;

notify pgrst,'reload schema';
commit;

