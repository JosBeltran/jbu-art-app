begin;
-- Repeatable reference import. Existing checkout continues to read the legacy source.
insert into public.products (sku,family_code,title_es,title_en,legacy_artwork_id,legacy_source)
select 'LEGACY-ART-' || a.id,
  case when a.physical_edition_type='LIMITED_EDITION' then 'physical_edition' else 'original' end,
  left(coalesce(nullif(trim(a.title),''),nullif(trim(a.sku),''),a.id::text),240),a.title_en,a.id,'artwork'
from public.artworks a
where not coalesce(a.is_historical_version,false)
  and (a.version_kind is distinct from 'SUCCESSOR' or a.version_published_at is not null)
  and (a.status::text in ('AVAILABLE','OWNED') or a.physical_edition_type='LIMITED_EDITION')
on conflict (legacy_artwork_id,legacy_source) do nothing;

insert into public.products (sku,family_code,title_es,title_en,legacy_artwork_id,legacy_source)
select 'LEGACY-PRINTS-' || a.id, 'fine_art_print',
  left(coalesce(nullif(trim(a.title),''),nullif(trim(a.sku),''),a.id::text),240), a.title_en, a.id, 'prints'
from public.artworks a
where (exists (select 1 from public.artwork_prints v where v.artwork_id=a.id)
   or (a.allows_prints and coalesce(a.print_price_mxn,0)>0))
on conflict (legacy_artwork_id,legacy_source) do nothing;

insert into public.artwork_products (artwork_id,product_id,relationship_type,is_primary)
select legacy_artwork_id,id,case when legacy_source='artwork' then 'original' else 'derived' end,true
from public.products where legacy_artwork_id is not null on conflict do nothing;

insert into public.product_variants (product_id,sku,title,fulfillment_type,inventory_policy,allowed_countries,legacy_artwork_id,legacy_source)
select p.id,'LEGACY-ART-' || a.id,a.sku,'manual','legacy',a.allowed_shipping_countries,a.id,'artwork'
from public.products p join public.artworks a on a.id=p.legacy_artwork_id where p.legacy_source='artwork'
on conflict (legacy_artwork_id,legacy_source) do nothing;
insert into public.product_variants (product_id,sku,title,fulfillment_type,inventory_policy,allowed_countries,legacy_print_id)
select p.id,'LEGACY-PRINT-' || v.id,coalesce(v.title,v.sku),'manual','legacy',v.allowed_shipping_countries,v.id
from public.products p join public.artwork_prints v on v.artwork_id=p.legacy_artwork_id where p.legacy_source='prints'
on conflict (legacy_print_id) do nothing;
insert into public.product_variants (product_id,sku,fulfillment_type,inventory_policy,legacy_artwork_id,legacy_source)
select p.id,'LEGACY-UNMANAGED-' || a.id,'manual','legacy',a.id,'legacy_print'
from public.products p join public.artworks a on a.id=p.legacy_artwork_id
where p.legacy_source='prints' and a.allows_prints and a.print_price_mxn>0
  and not exists(select 1 from public.artwork_prints v where v.artwork_id=a.id)
on conflict (legacy_artwork_id,legacy_source) do nothing;

insert into public.product_variant_attribute_values (variant_id,attribute_code,text_value)
select pv.id, option.code, option.value
from public.product_variants pv join public.artwork_prints v on v.id=pv.legacy_print_id
cross join lateral (values ('size',v.size::text),('material',v.paper_type),('finish',v.finish::text),('frame',v.framing)) option(code,value)
where nullif(trim(option.value),'') is not null on conflict do nothing;
insert into public.product_variant_attribute_values (variant_id,attribute_code,enum_value)
select pv.id,'edition',case when upper(v.edition_type::text) in ('LIMITED','LIMITADA') then 'limited' else 'open' end
from public.product_variants pv join public.artwork_prints v on v.id=pv.legacy_print_id
on conflict do nothing;

insert into public.price_book_entries (price_book_id, product_variant_id, amount_minor, status)
select b.id, v.id, round(x.amount*100)::bigint, 'reference'
from public.product_variants v
left join public.artworks a on a.id=v.legacy_artwork_id
left join public.artwork_prints print on print.id=v.legacy_print_id
cross join public.price_books b
cross join lateral (values (
  case when print.id is not null then print.price
       when v.legacy_source='legacy_print' then a.print_price_mxn
       else coalesce(nullif(a.base_price_mxn,0),a.calculated_price_mxn) end
)) x(amount)
where b.code='legacy-mxn' and x.amount between 0.01 and 9999999999.99
on conflict (price_book_id,product_variant_id) where status='reference' do nothing;
commit;
