-- Public auction-lot projection. Unlike artworks_discoverable, an explicitly
-- published auction lot must remain visible even when its parent series is
-- not featured in the catalogue or Home.
--
-- Narrow, read-only projection: no reserve prices, owners, bidder identities,
-- order data, certificates, or hidden draft records are exposed.
-- View ownership is intentional: do not enable security_invoker on this
-- projection, since visitors may lack direct SELECT privileges on artworks.
-- The source auctions_public view itself exposes only approved auction fields.
begin;

create or replace view public.auction_lots_public as
select ap.*,
       art.sku as artwork_sku,
       art.title as artwork_title,
       art.primary_image_url as artwork_primary_image_url
  from public.auctions_public ap
  join public.auction_events ev on ev.id = ap.auction_event_id
  join public.artworks art on art.id = ap.artwork_id
 where ev.status <> 'DRAFT'
   and ap.auction_event_id is not null
   and art.status::text in ('AVAILABLE', 'OWNED');

revoke all on public.auction_lots_public from public;
grant select on public.auction_lots_public to anon, authenticated, service_role;

comment on view public.auction_lots_public is
  'Only published auction lots and minimal display fields of their artworks. No private data.';

commit;
