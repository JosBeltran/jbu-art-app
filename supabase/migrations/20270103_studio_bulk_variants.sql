begin;

create or replace function public.set_studio_print_selection(_actor uuid,_session uuid,_candidate uuid,_configuration jsonb,_artwork_print uuid)
returns boolean language plpgsql set search_path=public as $$
declare workspace product_discovery_sessions; manifest jsonb;
begin
  select * into workspace from product_discovery_sessions where id=_session for update;
  if _actor is null or not found or workspace.created_by<>_actor or workspace.state not in ('open','review') then raise exception 'wall_art_session_invalid'; end if;
  perform 1 from product_discovery_candidates where id=_candidate and session_id=_session;
  if not found or jsonb_typeof(_configuration) is distinct from 'object' then raise exception 'wall_art_candidate_invalid'; end if;
  perform 1 from artwork_prints where id=_artwork_print and artwork_id=workspace.artwork_id and is_active and size_code is not null for share;
  if not found then raise exception 'studio_artwork_print_required'; end if;
  manifest:=coalesce(workspace.criteria->'matrixSelections','[]');
  if exists(select 1 from jsonb_array_elements(manifest) e where e->>'candidateId'=_candidate::text and e->'configuration'=_configuration and e->>'artworkPrintId'=_artwork_print::text) then return true; end if;
  manifest:=manifest||jsonb_build_array(jsonb_build_object('candidateId',_candidate,'configuration',_configuration,'artworkPrintId',_artwork_print));
  update product_discovery_sessions set criteria=jsonb_set(criteria,'{matrixSelections}',manifest) where id=_session;
  return true;
end $$;

create function public.publish_studio_variants(_actor uuid,_product uuid,_variants uuid[])
returns jsonb language plpgsql set search_path=public as $$
declare target uuid; entry uuid; current_status text; product_status text;
  results jsonb := '[]'; problem_detail text; problem_message text;
begin
  if _actor is null or coalesce(cardinality(_variants),0) not between 1 and 12 then
    raise exception 'publication_transition_invalid';
  end if;
  perform 1 from products where id=_product and legacy_source is null for update;
  if not found or not exists (
    select 1 from wall_art_studio_saves saved
    join product_discovery_sessions s on s.id=saved.session_id
    where _product=any(saved.product_ids) and s.created_by=_actor
  ) then raise exception 'publication_transition_invalid'; end if;

  foreach target in array _variants loop
    begin
      select status into current_status from product_variants
        where id=target and product_id=_product and status<>'archived' for update;
      if not found then raise exception 'publication_transition_invalid'; end if;
      select status into product_status from products where id=_product;
      if current_status<>'active' or product_status<>'published' then
        for entry in
          select e.id from price_book_entries e join price_books b on b.id=e.price_book_id
          where e.product_variant_id=target and e.status='draft' and b.status='active'
          order by b.id,e.id
        loop
          perform approve_catalog_price(_actor,entry);
        end loop;
        if product_status='draft' then
          perform review_catalog_product(_actor,_product);
          product_status := 'pending_review';
        end if;
        if product_status='pending_review' then
          perform transition_fine_art_product(_actor,_product,'approve',null);
        end if;
        perform transition_fine_art_product(_actor,_product,'publish',target);
      end if;
      results := results || jsonb_build_array(jsonb_build_object('variantId',target,'published',true));
    exception when raise_exception or integrity_constraint_violation then
      get stacked diagnostics problem_message=message_text,problem_detail=pg_exception_detail;
      results := results || jsonb_build_array(jsonb_build_object('variantId',target,'published',false,'problems',
        case when problem_message='publication_requirements_missing' then problem_detail::jsonb
          when sqlstate='P0001' then jsonb_build_array(problem_message)
          else jsonb_build_array('invalid_catalog_record') end));
    end;
  end loop;
  return results;
end $$;

revoke all on function public.publish_studio_variants(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.publish_studio_variants(uuid,uuid,uuid[]) to service_role;

commit;
