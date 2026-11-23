-- Run as a database administrator in Supabase SQL Editor. Use the inventory
-- script first. Paste only the exact test product UUIDs into product_ids.
-- First run: leave confirmation and administrator NULL. The transaction writes no persistent records.
-- After reviewing the output, rerun with the returned confirmation and your admin UUID.
begin;
set local search_path=public,pg_temp;
set local lock_timeout='5s';
create temporary table cleanup_input on commit drop as
select array[]::uuid[] as product_ids,
       null::text as confirmation,
       null::uuid as administrator;

do $$
declare params cleanup_input;
begin
  select * into params from cleanup_input;
  if cardinality(params.product_ids) not between 1 and 50
    or cardinality(params.product_ids) is distinct from
      (select count(distinct id)::int from unnest(params.product_ids) id)
  then raise exception 'Provide 1 to 50 distinct product IDs'; end if;
  if params.confirmation is not null then
    if params.administrator is null or not exists (
      select 1 from public.user_roles where user_id=params.administrator and role::text='admin'
    ) then raise exception 'An administrator UUID is required'; end if;
    -- Close the race between rechecking commercial dependencies and deleting.
    lock table products,product_variants,artwork_products,product_variant_attribute_values,
      product_media,product_variant_assets,price_book_entries,wall_art_mockups,provider_product_mappings,
      wall_art_studio_saves,product_discovery_sessions,product_discovery_candidates,product_discovery_selections,
      provider_quotes,catalog_fulfillment_jobs,fine_art_checkouts,order_items in share row exclusive mode;
  end if;
end $$;

-- Fail closed if the deployed schema adds a dependency this procedure has not reviewed.
create temporary table cleanup_unreviewed_fk on commit drop as
select conrelid::regclass::text child, confrelid::regclass::text parent, conname
from pg_constraint
where contype='f' and confrelid in (
  'products'::regclass,'product_variants'::regclass,'price_book_entries'::regclass,
  'provider_product_mappings'::regclass,'wall_art_mockups'::regclass,'product_variant_assets'::regclass,
  'product_media'::regclass,'artwork_products'::regclass,'product_variant_attribute_values'::regclass,
  'product_discovery_sessions'::regclass,'product_discovery_candidates'::regclass,
  'product_discovery_selections'::regclass,'wall_art_studio_saves'::regclass
) and (conrelid,confrelid) not in (
  ('product_variants'::regclass,'products'::regclass),
  ('artwork_products'::regclass,'products'::regclass),
  ('product_media'::regclass,'products'::regclass),
  ('product_variant_attribute_values'::regclass,'product_variants'::regclass),
  ('product_variant_assets'::regclass,'product_variants'::regclass),
  ('price_book_entries'::regclass,'product_variants'::regclass),
  ('wall_art_mockups'::regclass,'product_variants'::regclass),
  ('provider_product_mappings'::regclass,'product_variants'::regclass),
  ('product_discovery_selections'::regclass,'product_variants'::regclass),
  ('wall_art_studio_saves'::regclass,'product_discovery_sessions'::regclass),
  ('product_discovery_candidates'::regclass,'product_discovery_sessions'::regclass),
  ('product_discovery_selections'::regclass,'product_discovery_candidates'::regclass),
  ('provider_quotes'::regclass,'product_discovery_candidates'::regclass),
  ('catalog_fulfillment_jobs'::regclass,'provider_product_mappings'::regclass)
);

create temporary table cleanup_preview on commit drop as
with selection as (
  select distinct id from cleanup_input cross join lateral unnest(product_ids) id
), scoped as (
  select choice.id, p.title_es, p.sku, p.status, p.legacy_source, p.legacy_artwork_id,
    evidence.session_ids, evidence.artwork, evidence.artwork_id, evidence.workflow, evidence.provenance_count
  from selection choice left join products p on p.id=choice.id
  cross join lateral (
    select array_agg(saved.session_id order by saved.session_id) session_ids, min(a.title) artwork,
      min(a.id::text)::uuid artwork_id, min(s.criteria->>'workflow') workflow, count(*) provenance_count
    from wall_art_studio_saves saved
    join product_discovery_sessions s on s.id=saved.session_id
    left join artworks a on a.id=s.artwork_id
    where saved.product_ids @> array[choice.id]
  ) evidence
), details as (
  select scoped.*, v.ids variant_ids, v.skus variant_skus, v.legacy, v.active_variant,
    (select count(*) from order_items oi
      where oi.catalog_configuration_snapshot->>'productId'=scoped.id::text
        or oi.catalog_configuration_snapshot->>'variantId'=any(v.ids::text[])
        or oi.sku_snapshot=scoped.sku or oi.sku_snapshot=any(v.skus)) order_items_count,
    (select count(*) from fine_art_checkouts c where exists (
      select 1 from jsonb_array_elements(c.lines) line where line->>'productId'=scoped.id::text
        or line->>'variantId'=any(v.ids::text[]) or line->>'sku'=scoped.sku
        or line->>'sku'=any(v.skus))) checkouts_count,
    (select count(*) from catalog_fulfillment_jobs j where j.mapping_id in (
      select m.id from provider_product_mappings m where m.product_variant_id=any(v.ids))
      or j.snapshot->>'variantId'=any(v.ids::text[]) or j.snapshot->>'productId'=scoped.id::text) fulfillment_count,
    jsonb_build_object(
      'products', (scoped.status is not null)::int,
      'variants', cardinality(v.ids),
      'prices', (select count(*) from price_book_entries where product_variant_id=any(v.ids)),
      'price_books_retained', (select count(distinct price_book_id) from price_book_entries where product_variant_id=any(v.ids)),
      'attributes', (select count(*) from product_variant_attribute_values where variant_id=any(v.ids)),
      'mockups', (select count(*) from wall_art_mockups where variant_id=any(v.ids)),
      'provider_mappings', (select count(*) from provider_product_mappings where product_variant_id=any(v.ids)),
      'product_media', (select count(*) from product_media where product_id=scoped.id),
      'variant_asset_links', (select count(*) from product_variant_assets where variant_id=any(v.ids)),
      'artwork_links', (select count(*) from artwork_products where product_id=scoped.id),
      'discovery_selections', (select count(*) from product_discovery_selections where product_variant_id=any(v.ids))
    ) record_counts
  from scoped
  cross join lateral (
    select coalesce(array_agg(id order by id),'{}') ids, coalesce(array_agg(sku order by id),'{}') skus,
      bool_or(legacy_source is not null or legacy_print_id is not null or legacy_artwork_id is not null) legacy, bool_or(status='active') active_variant
    from product_variants where product_id=scoped.id
  ) v
)
select *, array_remove(array[
  case when status is null then 'product_missing' end,
  case when legacy_source is not null or legacy_artwork_id is not null or legacy then 'legacy_product' end,
  case when provenance_count<>1 or workflow is distinct from 'wall_art' or artwork_id is null
    or not exists(select from artwork_products ap where ap.product_id=details.id and ap.artwork_id=details.artwork_id
      and ap.relationship_type='derived' and ap.is_primary) then 'studio_provenance_unverified' end,
  case when status='published' or active_variant then 'still_on_sale_unpublish_first' end,
  case when order_items_count>0 then 'order_history_protected' end,
  case when checkouts_count>0 then 'checkout_history_protected' end,
  case when fulfillment_count>0 then 'fulfillment_history_protected' end,
  case when exists(select from cleanup_unreviewed_fk) then 'unreviewed_foreign_key' end
],null) blockers
from details;

-- Remove a session only if every saved product is confirmed and it has neither
-- surviving selections nor quotes. Archive empty sessions with quotes.
create temporary table cleanup_sessions on commit drop as
select w.session_id, w.product_ids old_ids, array(
  select id from unnest(w.product_ids) with ordinality listed(id,position)
  where not exists(select from cleanup_preview p where p.id=listed.id and cardinality(p.blockers)=0)
  order by position
) remaining_ids,
  (select count(*) from product_discovery_candidates c where c.session_id=w.session_id) candidate_count,
  (select count(*) from provider_quotes q join product_discovery_candidates c on c.id=q.candidate_id
    where c.session_id=w.session_id) quote_count,
  (select count(*) from product_discovery_selections s join product_discovery_candidates c on c.id=s.candidate_id
    where c.session_id=w.session_id and not exists(select from cleanup_preview p
      where s.product_variant_id=any(p.variant_ids) and cardinality(p.blockers)=0)) remaining_selections
from wall_art_studio_saves w
where exists(select from cleanup_preview p where w.product_ids @> array[p.id] and cardinality(p.blockers)=0);

create temporary table cleanup_token on commit drop as
select md5(jsonb_build_object(
  'products',(select jsonb_agg(to_jsonb(p) order by p.id) from cleanup_preview p),
  'sessions',(select jsonb_agg(to_jsonb(s) order by s.session_id) from cleanup_sessions s)
)::text) confirmation;

do $$
declare params cleanup_input; target_ids uuid[]; variant_ids uuid[]; dead_sessions uuid[];
begin
  select * into params from cleanup_input;
  if params.confirmation is null then return; end if;
  if params.confirmation is distinct from (select confirmation from cleanup_token)
    then raise exception 'Preview changed. Run dry run again and confirm the new token'; end if;
  if exists(select from cleanup_preview where cardinality(blockers)>0)
    then raise exception 'Remove blocked IDs and confirm a new preview'; end if;

  select array_agg(id) into target_ids from cleanup_preview;
  select coalesce(array_agg(v),'{}') into variant_ids from cleanup_preview p cross join lateral unnest(p.variant_ids) v;
  select coalesce(array_agg(session_id),'{}') into dead_sessions from cleanup_sessions
    where cardinality(remaining_ids)=0 and quote_count=0 and remaining_selections=0;

  delete from product_discovery_selections where product_variant_id=any(variant_ids);
  delete from price_book_entries where product_variant_id=any(variant_ids);
  delete from product_variant_attribute_values where variant_id=any(variant_ids);
  delete from wall_art_mockups where variant_id=any(variant_ids);
  delete from provider_product_mappings where product_variant_id=any(variant_ids);
  delete from product_variant_assets where variant_id=any(variant_ids);
  delete from product_media where product_id=any(target_ids);
  delete from artwork_products where product_id=any(target_ids);
  delete from product_variants where id=any(variant_ids);
  delete from products where id=any(target_ids);

  update wall_art_studio_saves w set product_ids=s.remaining_ids from cleanup_sessions s
    where w.session_id=s.session_id and not (s.session_id=any(dead_sessions))
      and (cardinality(s.remaining_ids)>0 or s.remaining_selections>0);
  delete from wall_art_studio_saves w using cleanup_sessions s
    where w.session_id=s.session_id and cardinality(s.remaining_ids)=0 and s.remaining_selections=0;
  update product_discovery_sessions d set state='archived' from cleanup_sessions s
    where d.id=s.session_id and cardinality(s.remaining_ids)=0 and s.remaining_selections=0 and s.quote_count>0;
  delete from product_discovery_candidates where session_id=any(dead_sessions);
  delete from product_discovery_sessions where id=any(dead_sessions);

  if exists(select from products where id=any(target_ids))
    or exists(select from product_variants where id=any(variant_ids) or product_id=any(target_ids))
    or exists(select from wall_art_studio_saves where product_ids && target_ids)
    or exists(select from product_discovery_sessions where id=any(dead_sessions))
    then raise exception 'Cleanup verification failed'; end if;

  insert into product_catalog_audit(actor_id,operation,subject_id)
    select params.administrator,'studio_test_cleanup '||record_counts::text,id from cleanup_preview;
  insert into product_catalog_audit(actor_id,operation,subject_id)
    select params.administrator,'studio_test_session_cleanup candidates='||candidate_count,session_id
    from cleanup_sessions where session_id=any(dead_sessions);
end $$;

select case when confirmation is null then 'dry_run' else 'deleted_and_verified' end as result,
  (select count(*) from cleanup_preview where cardinality(blockers)=0) eligible_products,
  (select token.confirmation from cleanup_token token) preview_token,
  (select jsonb_agg(to_jsonb(p) || jsonb_build_object('eligible',cardinality(p.blockers)=0) order by p.id)
    from cleanup_preview p) products,
  (select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('action',case
    when cardinality(s.remaining_ids)>0 or s.remaining_selections>0 then 'keep_session_update_save'
    when s.quote_count>0 then 'archive_session_keep_quotes' else 'delete_session_and_candidates' end)
    order by s.session_id),'[]') from cleanup_sessions s) sessions,
  (select coalesce(jsonb_agg(to_jsonb(fk)),'[]') from cleanup_unreviewed_fk fk) unreviewed_foreign_keys
from cleanup_input;
commit;
