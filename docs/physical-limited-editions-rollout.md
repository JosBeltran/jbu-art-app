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


## Continuation PR #31 — Stripe checkout and individual certificates

Additional **additive** migrations must be applied in order:
1. `20261115_physical_edition_checkout_core.sql`
2. `20261116_physical_edition_certificates.sql`

Both require the foundation migration `20261114`. **Do not apply to production just to see UI**. Use a staging Supabase project and Stripe test keys. The public sales flag is still false by default. This PR must remain draft until end-to-end tests pass.

### Architecture
- `POST /api/checkout/physical-edition` requires a verified session and one artwork ID and opaque request UUID.
- The service-only `create_physical_edition_checkout_hold` transaction locks the artwork and an available numbered unit, then creates an individual hold valid 35 minutes.
- Stripe Checkout expires after 30 minutes and stores the hold ID in signed-session metadata. No funds are accepted by this route while sales remain disabled.
- A verified `checkout.session.completed` event calls `fulfill_physical_edition_checkout`; that single DB transaction inserts an order plus one numbered item, marks only the unit SOLD and marks the hold PAID. Retries return the exact same order and unit.
- A verified `checkout.session.expired` event releases only a still-unpaid hold; a browser cancel redirect never releases it.
- Physical COA issuance is **after the order is PAID and DELIVERED**, buyer-only, and unit-scoped. The immutable certificate is stored separately in `physical_edition_certificates`, using the existing PDF renderer and `/verify/[unit-sku]` QR route.
- Fine Art Prints and unique originals keep their original sale and certificate pathways. Physical editions do **not** support COD, offers, auctions, multi-item carts, or discounts yet; do not enable them through a workaround.

### QA checklist before enabling a sale
- Vercel build passes and the new Node certificate tests pass.
- Apply 20261115 and 20261116 to staging with 20261114 already installed.
- Existing UNIQUE Stripe purchase, Fine Art Print purchase, and existing certificate verification are unchanged.
- One signed-in customer using Stripe **test mode** can buy a numbered edition; order SKU is the exact allocated unit and master artwork remains AVAILABLE.
- Concurrent test checkouts from two customers allocate distinct units. Simulate the final available unit and verify no oversell.
- Repeat a completed Stripe webhook; second response is idempotent, with exactly one order, one sold unit and one certificate.
- Expire an **unpaid** checkout session and check its unit reverts to AVAILABLE. Do not release a paid unit.
- Deliver the paid order and claim the numbered unit certificate from the order page. Verify private download, persistent SHA-256 integrity, QR verification, and no other buyer can download it.
- Check failures when the image/signature is missing; ownership remains valid, PDF stays pending.
- Verify that neither the master artwork's ownership status nor old unique COAs are modified.
- Explicitly test all intended locales/currencies; missing currency should fail closed rather than create a partial charge.
- Review shipping/country eligibility before production enabling.
- Reconcile refunds, cancellations and returns with a dedicated written procedure. A refunded unit must **not** be automatically re-issued with the same certificate identity.
- Establish reconciliation for bound holds without a received Stripe expiry webhook. Never indiscriminately expire sessions by elapsed time alone.

### Read-only validation SQL (run after installing migrations in staging)
```sql
select a.sku, a.physical_edition_size,
 count(u.id) total_units,
 count(u.id) filter (where u.status='AVAILABLE') available,
 count(u.id) filter (where u.status='RESERVED') reserved,
 count(u.id) filter (where u.status='SOLD') sold
from public.artworks a
join public.artwork_edition_units u on u.artwork_id=a.id
where a.physical_edition_type='LIMITED_EDITION'
group by a.id,a.sku,a.physical_edition_size
order by a.sku;

select h.id, h.status, h.stripe_session_id, u.unit_identifier,
       h.expires_at, h.order_id
from public.physical_edition_checkout_holds h
join public.artwork_edition_units u on u.id=h.unit_id
order by h.created_at desc limit 50;

select u.unit_identifier, u.status, oi.sku_snapshot,
       c.certificate_number, c.pdf_hash
from public.artwork_edition_units u
left join public.order_items oi on oi.id=u.order_item_id
left join public.physical_edition_certificates c on c.id=u.certificate_id
where u.status='SOLD'
order by u.unit_identifier;

select unit_identifier, count(*) from public.artwork_edition_units
group by unit_identifier having count(*)>1;
```

### Activation note
Migration 20261116 adds a guarded `set_physical_edition_sales_enabled` RPC, and Admin Artwork Edit shows an explicit activation/pause button after configuration. Keep sales disabled until you have completed the staging test checklist. Never update `physical_edition_sales_enabled` directly in SQL. Even when sales are enabled, the first checkout is direct Stripe only; COD, auctions, offers, coupons and mixed carts require a separate implementation and should not be enabled as workarounds.
