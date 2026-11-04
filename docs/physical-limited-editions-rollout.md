# Physical limited editions — staged rollout

## Current foundation (20261114)
This branch implements **configuration and inventory only**, not live sales.

- Every existing artwork stays `UNIQUE` by default.
- Admin artwork edit has a physical edition panel. It calls `configure_physical_edition` to create one immutable identifier per unit: `{artwork.sku}-{NNN}`.
- Limited editions display a bilingual "Limited Edition of N" badge and read-only availability counts.
- The legacy original checkout is blocked in UI and API for physical editions.
- A database order_items guard prevents any existing fulfillment route (Stripe, COD, offers, auctions) from selling a numbered unit as an original.
- The old unique-original and print edition schema remains unchanged.

**Do not market numbered units as purchasable yet.** The foundation intentionally fails closed.

## Before applying migration
1. Verify migrations through 20261113 are applied; especially `is_jbu_admin`, `order_items`, `certificates`, `auctions` and `artwork_offers`.
2. Back up the database and review current constraints/RLS in the destination.
3. Apply `supabase/migrations/20261114_physical_limited_editions_foundation.sql` in a staging environment.
4. Verify existing UNIQUE sales and certificate issue/claim behavior in staging.
5. Configure a *new, never-sold* test artwork as LIMITED_EDITION with size 50.
6. Verify 50 identifiers generated and unique; confirm no checkout can be started or completed for that artwork.
7. Verify existing prints work on a UNIQUE artwork. **Prints attached to LIMITED_EDITION artworks are also blocked at the DB order-items guard until the next phase provides a signed item kind.**

## Next phase before sales
- Add a securely typed `order_items` line kind that distinguishes original, print, and physical edition. Do not infer it from titles or claim tokens.
- Introduce transactional reservation, expiry, finalization, idempotency and reconciliation of individual numbered units in Stripe.
- Extend local delivery, offers, and auctions explicitly or keep them unavailable for limited editions.
- Implement unit-scoped certificate snapshots, PDF/QR verification, claim and collector ownership. Existing `certificates` has a one-active-per-artwork restriction and cannot be reused unmodified.
- Implement cancellation and refunds without recycling issued identities.
- Add concurrency tests and end-to-end test fixtures for several simultaneous payments.
- Only after end-to-end tests pass, enable edition sales through a controlled production rollout.

## Useful read-only checks
```sql
select physical_edition_type, count(*) from public.artworks group by 1;
select a.sku, a.physical_edition_size, count(u.id) units,
 count(u.id) filter (where u.status='AVAILABLE') available,
 count(u.id) filter (where u.status='RESERVED') reserved,
 count(u.id) filter (where u.status='SOLD') sold
from public.artworks a
left join public.artwork_edition_units u on u.artwork_id=a.id
where a.physical_edition_type='LIMITED_EDITION'
group by a.id, a.sku, a.physical_edition_size;
select unit_identifier, count(*) from public.artwork_edition_units
group by unit_identifier having count(*)>1;
```

## Operational note
Do not turn `physical_edition_sales_enabled` on by direct SQL: that flag is not hooked into commerce yet. The sale guard intentionally rejects all limited-edition order items until the replacement transaction is implemented and audited.
