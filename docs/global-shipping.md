# Global shipping and fulfillment

## Repository audit

This implementation extends the existing Next 16 / Carbon / Supabase / Stripe Hosted Checkout application. It does not create another product, cart, order, payment or fulfillment model.

| Area | Existing implementation and integration |
| --- | --- |
| Originals and numbered physical editions | `artworks`; existing `allowed_shipping_countries` is reused. Physical numbered editions retain their hold/unit RPC and existing sales gate. |
| Open and hand-embellished limited prints | `artwork_prints`, `edition_type` OPEN/LIMITED, existing active/availability/inventory checks, print revisions and production queue. |
| Countries | `lib/shippingCountries.js`, `lib/countryAvailability.js`, the product administration field, catalog and print discovery. Former runtime fallback MX/CA/US and environment-only included coverage are replaced with singleton settings. |
| Public catalogs | `getCatalogData`, `getPublicPrintCollection`; effective parent/variant countries are resolved before country filtering, counting and pagination. All Countries remains browsing only. |
| Physical checkout | `/api/checkout`, `/api/checkout/open-edition`, `/api/checkout/physical-edition`, `createAuctionCheckout` (Buy Now, winner and accepted offer). All reuse one shipping preparer. |
| Cart | Existing collector cart and browser print cart; refresh endpoint supplies effective variant/parent countries. Digital-only endpoints remain separate. |
| Settings | Existing singleton `site_settings` row (`id = true`); new shipping columns. No separate settings application. |
| Orders | Existing `orders` / `order_items` and transactional fulfillment RPCs. Shipping snapshot is added by an order INSERT trigger inside those transactions. |
| Payments | Signed `/api/webhooks/stripe`; existing original/print/guest/physical-edition/pending-purchase fulfillment routes are preserved. Paid async success now uses the same gates. Points webhook is unchanged. |
| Local delivery | Existing calendar/address/appointment and payment-on-delivery workflow remains in place, including SQL reservation rules. It also checks globally enabled Mexico. |
| Supplier | Print asset defaults reference Prodigi paper. No existing live Prodigi shipping/rate or destination API was found. Fulfillment provider is configured on policies; no provider API is introduced. |
| Digital | Existing digital/points/certificate purchase paths remain unchanged. Shared country/shipping services ignore digital items for physical shipping, preserving separate licensing restrictions. The existing physical cart endpoint still accepts only its supported ORIGINAL/PRINT types; this change does not add a new digital cart checkout. |

Parent country restrictions now also narrow print variants, as requested. Existing explicit arrays are preserved, including globally disabled destinations; enabling that market again restores its eligibility. No global country list is copied into products.

## Architecture

- `shippingCountries.js`: Stripe-supported ISO alpha-2 normalization, deduplication and global / artwork / variant / supplier intersections. Missing global configuration fails closed. The country catalog was compared with the installed Stripe 22.6 SDK's `ShippingAddressCollection.AllowedCountry`; Stripe pseudo-codes are excluded.
- `shippingPolicies.js`: pure policy validation, category inheritance, explicit overrides, destination-specific options and safe quantity/provider grouping. Explicit variant policy lists take precedence over artwork policy lists, then category defaults. Empty lists inherit.
- `shippingSettings.server.js`: uncached settings and policy reads. Admin updates affect the next checkout without deployment. Public projection omits administrative notes.
- `checkoutShipping.server.js`: authoritative server preparation, frozen `shipping_checkouts` manifest, Stripe inline fixed rates and business-day estimates. A locked SQL binding rejects a configuration revision changed while preparing a session.
- `shippingPayment.server.js`: after signature verification and confirmed payment, checks bound session, destination, selected Stripe rate metadata, currency, amount and line totals. Product-only totals go to the original inventory RPCs. The order INSERT trigger adds the canonical MXN shipping amount once and copies the verified snapshot atomically.
- Existing session reuse requires the same shipping fingerprint (policies, destinations, rates, estimates and settings revision). Stale pending-purchase sessions are expired before replacement. Physical numbered-edition holds retain their existing non-reusable-session error/reconciliation lifecycle; their existing sales-disabled gate is unchanged.
- `/admin/shipping`: Carbon destinations, reusable policies, category defaults and server-resolved product preview. Artwork and print administration expose inheritance and overrides. Existing order administration exposes historical selection, provider groups, estimates, insurance, label receipt, collection state, tracking and logistics notes.
- Public checkout requests use the existing endpoint. Only `shipping_destination_required` opens a Carbon country dialog and retries with the selected country. Uniform options require no extra step. Client shipping prices and policy IDs are ignored.

### Rates and fulfillment

Amounts in policies are MXN minor units (`35000` means MXN 350). Checkout conversion uses the existing MXN/USD currency utility, including its existing whole-dollar USD rounding. No additional currency is introduced. Shipping is charged in the same currency/payment as the products; historical order snapshots retain both charged shipping and canonical MXN shipping.

`PER_ITEM` is the safe default and includes quantity. `PER_ORDER` explicitly charges once for that policy. `PER_PROVIDER` charges once for each policy/provider group. Separate policies are never assumed to share a charge. Included-shipping items contribute zero. Compatible provider groups are represented by a single combined shipping rate and retained individually in the snapshot. Incompatible delivery/pickup/buyer arrangements, more than five final options, or excessive combinations block checkout.

## Migration and first production configuration

1. Back up Supabase and test on a staging copy with the existing migrations already applied, including `20261201_product_shipping_countries.sql`.
2. Inspect the current deployment's `JBU_INCLUDED_SHIPPING_COUNTRIES`. The repository default was MX, CA, US. If production explicitly enabled other markets through that variable, initialize `site_settings.global_shipping_countries` to that verified list during rollout; SQL cannot read hosting environment variables. Do not infer or enable new markets.
3. Apply `supabase/migrations/20261202_global_shipping_policies.sql` before deploying application code. The migration adds columns, policies, manifests, RLS and triggers; it preserves product data and all explicit country restrictions.
4. The migration explicitly seeds **Existing included shipping**, zero amount and no delivery estimate, matching the existing checkout behavior. It assigns that policy to current physical categories, leaving supplier defaults empty. This is a compatibility policy, not an invented carrier price, guaranteed estimate or automatic claim of Prodigi fulfillment. Review it before expanding markets.
5. Deploy the application with the existing Supabase and Stripe configuration. No new private credential is required. The old `JBU_INCLUDED_SHIPPING_COUNTRIES` variable is no longer used at runtime.
6. Open **Shipping & Fulfillment / Envíos y gestión logística** in Admin. Review and save destinations. Enabling all markets is an explicit Admin action; only enable operationally approved markets.
7. Create a policy with real approved destinations, bilingual display names, method, base-currency amount, provider, calculation strategy and optional delivery estimate. Use business days; omit estimates until established. Set provider PRODIGI only for products actually fulfilled through that workflow.
8. Assign the policy under **Open Edition prints**, original artworks or the appropriate existing category. Existing unrestricted products immediately inherit both destinations and defaults. No variant-by-variant update is needed.
9. For multiple methods or destination rates, assign all applicable policies to the category or explicit override. Only active policies matching the destination are eligible. Empty policy country list means globally enabled destinations, further narrowed by item restrictions.
10. Preserve `ENABLE_GUEST_OPEN_EDITION_CHECKOUT` and the existing physical edition sales configuration. This feature does not activate either gated commerce flow.
11. Verify the Stripe webhook is configured for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, failures and existing expiry events. Use staging/test keys and test buyers; never run a production payment as an implementation test.

Policy and configuration mutations require a verified user JWT and `is_jbu_admin()`; product writes retain existing Admin protection. Shipping manifests are service-role only. Existing orders retain their own RLS. No browser can authorize a shipping amount, provider or policy.

## Special methods and current Hosted Checkout limits

- INCLUDED and FIXED_RATE are explicit fixed Stripe shipping options. Included shipping appears as a zero amount and is never inferred from missing policy configuration.
- LOCAL_DELIVERY without postal restrictions can be a configured paid or zero option. Existing local appointment/payment-on-delivery remains available separately. A postal-restricted Hosted Checkout policy is **blocked before payment**: Hosted Checkout cannot enforce the postal subset when the buyer edits their address. Use the existing local address/appointment workflow or an Admin-approved unrestricted arrangement for that purchase; do not advertise postal eligibility from a country alone. Address-locked postal delivery requires a future supported Checkout surface or reviewed business workflow.
- LOCAL_PICKUP is a configured option. BUYER_ARRANGED states that transportation is the buyer's responsibility, not free transportation; an approved handling fee can be charged. Collection/insurance validation is required before dispatch, and buyer labels and tracking use existing order administration.
- QUOTE_REQUIRED blocks ordinary payment and exposes the existing inquiry channel with shipping context. Email/internal requests reuse `artwork_inquiries`; guests can enter a contact email. Approval is an Admin-assigned, valid reusable policy/override with the approved amount. This is product/variant-level approval, not a buyer-specific expiring quotation system. For unique artworks this matches the existing single-product workflow; do not use a reusable print override for a private negotiated quote intended for only one buyer.
- Country-dependent Hosted Checkout options are calculated before creating the session and restricted to the selected country. Changing that country requires starting a new session through JBU. Uniform options allow all compatible countries directly inside Stripe. No arbitrary dynamic Hosted shipping recalculation is assumed.
- Open sessions already handed to buyers retain the frozen configuration until Stripe's existing expiry. New attempts use current settings; reusable pending sessions are checked against the fingerprint and stale sessions are expired. Emergency market withdrawal requires expiring already-open sessions in Stripe as well as disabling the country. Completed purchases are never changed.
- Supplier destinations must be explicitly approved in product restrictions and policy destinations. No live supplier/carrier availability is queried or inferred. Existing supplier restrictions are applied when present; there was no supplier-country field/API in the audited schema to duplicate.
- Payment branding, success/cancel routes, authentication and existing payment metadata are retained. Physical checkout creation omits the old card-only list so Stripe can display account-configured eligible dynamic methods; availability of Apple Pay/Link remains a Stripe/browser/account decision.

Official documentation reviewed with Stripe CLI 1.55.11: [Hosted shipping](https://docs.stripe.com/payments/during-payment/charge-shipping?ui=full-page), [Checkout Session creation](https://docs.stripe.com/api/checkout/sessions/create), [dynamic shipping surfaces](https://docs.stripe.com/payments/checkout/custom-shipping-options). Installed SDK: Stripe 22.6.x. Existing webhook API version is retained; address extraction supports both `collected_information.shipping_details` and the legacy `shipping_details` field.

## Automated and manual validation

Run the focused suite:

```sh
node --test lib/shippingCountries.test.js lib/countryAvailability.test.js lib/shippingPolicies.test.js lib/checkoutShipping.server.test.js lib/shipping.database.test.js lib/printManager.test.js lib/printManager.database.test.js
npx tsc --noEmit
```

The database tests use PGlite and real migration/trigger logic. They cover atomic totals/snapshots, immutable history, stale binding, non-Admin denial, label/arrangement gating and backward-compatible print saves. Pure and server tests cover global inheritance, Sweden enable/disable, UK-only and incompatible carts, parent/supplier intersection, missing/inactive defaults, explicit overrides, quantity/group charges, digital-only/mixed resolution, localization/currency conversion, destination-specific policies, quote and postal blocking, untrusted client values and Stripe payment mismatch rejection.

In staging, execute these manual scenarios with the actual Stripe Hosted Checkout page:

| Request scenarios | Manual procedure and expected result |
| --- | --- |
| 1–8, 19, 20, 23, 34 | Save MX/US/CA/GB, then enable SE. Unrestricted original/print gains SE without editing. GB-only remains GB. Disable SE: new sessions exclude it. Unsupported ISO/pseudo-codes fail. Empty intersection blocks. Different MX/US rates trigger country choice and only that country is allowed. Restarting in another country uses a new correct rate. |
| 9–13, 35 | Change category default, verify existing inherited product picks it up, explicit override stays unchanged. Deactivate/remove every eligible policy: payment blocks instead of becoming free. |
| 14–18, 21–22 | Configure real included/fixed policy and estimate; inspect actual Stripe method name in EN/ES, amount, business-day range, product subtotal and combined final total. Uniform policy offers all effective countries inside Stripe. Verify branding and eligible Link/Apple Pay on supported device. |
| 24–33 | Test original Buy Now, cart, guest OPEN (with existing feature flag), authenticated LIMITED, multiple quantities/providers, compatible GB cart, incompatible GB/MX cart, and configured Prodigi policy. Run existing digital download/payment regressions; digital-only has no physical shipping. Shared mixed resolver ignores digital restrictions; the existing physical endpoint does not gain unsupported digital cart types. |
| 36–41 | Local method with eligible approved country; postal-limited Hosted policy blocks safely. Exercise existing local appointment address rejection separately. Test pickup, buyer arrangement with optional handling fee, quote request and Admin-approved policy. Verify unpaid/unvalidated arrangement cannot ship. |
| 42–50 | Successful, failed, abandoned and paid async sessions. Replay the signed event: one order and inventory debit. Verify shipping amount/rate/country/estimate/groups on the existing order. Check original claim/ownership/CoA, limited inventory, guest email/order access, production revisions and unchanged digital delivery. Wrong currency/amount/destination or missing manifest requires reconciliation and returns failure before fulfillment. |

Actual Stripe UI/payment and authenticated Supabase staging checks require the deployment's configured test environment. Automated mocked Stripe calls do not constitute a Hosted Checkout visual verification.

The repository's pre-existing `package-lock.json` is out of sync with `package.json` (PGlite, Luxon/types and Zod); a clean `npm ci` fails before application tests. For local verification, dependencies were installed with `npm install --ignore-scripts --package-lock=false`. Reconcile the existing lockfile in the deployment workflow before relying on `npm ci`; this change does not upgrade the integration SDK or unrelated dependencies.

## Rollback

1. Stop new checkout attempts during rollback. Expire open Stripe sessions carrying `metadata.jbu_shipping_checkout`; reconcile any paid/in-flight sessions with the new webhook first.
2. Restore the previous application deployment. Before resuming old webhook fulfillment, remove only the `snapshot_order_shipping` INSERT trigger, so the old code (which passes the full paid total) cannot add shipping a second time:

```sql
begin;
drop trigger if exists snapshot_order_shipping on public.orders;
commit;
```

3. Keep shipping columns, policy rows and manifests for historical accounting and reconciliation. The old application ignores the added nullable product columns. Keep the immutable paid-snapshot guard; it does not rewrite existing orders. Do not drop order snapshots or roll back completed payments, ownership, inventory or certificates.
4. Restore the previous operational destination environment configuration for the old application. The retained globally-disabled-Mexico local-order guard continues to protect local orders; adjust only to the previously approved market list if necessary.
5. If redeploying the new code after that rollback, recreate the snapshot trigger from the migration before accepting shipping-enabled payments. Do not replay the entire non-idempotent migration. Review the backup/migration state instead.

### Verification results for this implementation

- Focused Node suite: **56 passed**, including database migration and transactional print-save regression tests.
- Administrative shipping API: **4 passed** with Bun, covering unauthenticated/non-Admin denial, invalid markets/defaults, zero-row failures and persisted readback.
- Broader Node regression run: **340 passed, 5 skipped**. Six test files use `bun:test` and cannot run under Node; all six passed when run in isolated Bun processes.
- Existing claim-eligible Admin API tests: **2 passed**. The pre-existing social-sharing API suite has **2 failures**, reproduced on the untouched base commit; its mock does not implement the current settings read. No shipping change is involved.
- TypeScript: `npx tsc --noEmit` passed.
- Next.js: Webpack production compilation (`next build --webpack --experimental-build-mode compile`) passed. This is a compilation check, not a deployment or live database/Stripe acceptance run.
- Existing touched screens contain baseline ESLint errors; comparison with the untouched base found no additional rule/message diagnostics. New shipping modules and administration screens were linted separately.
- Live Stripe Hosted Checkout visual/payment acceptance and authenticated staging UI remain **not executed**: no configured test Supabase/Stripe deployment was provided. Follow the manual matrix before production rollout.

## Modified and added files

- `app/ClientLayout.jsx`
- `app/admin/artworks/[id]/edit/page.tsx`
- `app/admin/artworks/new/page.jsx`
- `app/admin/layout.jsx`
- `app/admin/orders/page.jsx`
- `app/admin/prints/PrintManager.jsx`
- `app/admin/shipping/page.jsx`
- `app/api/admin/orders/[id]/route.js`
- `app/api/admin/shipping/route.js`
- `app/api/admin/shipping/route.test.js`
- `app/api/checkout/open-edition/route.js`
- `app/api/checkout/open-edition/variants/route.js`
- `app/api/checkout/physical-edition/route.js`
- `app/api/checkout/route.js`
- `app/api/inquiries/route.js`
- `app/api/pending-payment/route.js`
- `app/api/shipping/route.js`
- `app/api/webhooks/stripe/route.js`
- `app/artwork/[sku]/ArtworkDetailClient.tsx`
- `app/artwork/[sku]/ArtworkDetailPage.jsx`
- `app/cart/page.jsx`
- `components/AskForPriceButton.jsx`
- `components/BuyButton.jsx`
- `components/CartDrawer.jsx`
- `components/CartShippingNotice.jsx`
- `components/PhysicalEditionBuyButton.jsx`
- `components/admin/ShippingCountriesField.jsx`
- `components/admin/ShippingPolicyField.jsx`
- `components/delivery/PaymentDelivery.jsx`
- `components/shipping/ShippingProvider.jsx`
- `components/shipping/ShippingSummary.jsx`
- `context/CartContext.jsx`
- `docs/global-shipping.md`
- `lib/auctionCheckout.server.js`
- `lib/auctions.js`
- `lib/catalogData.server.js`
- `lib/catalogPrintAvailability.js`
- `lib/checkoutShipping.server.js`
- `lib/checkoutShipping.server.test.js`
- `lib/countryAvailability.js`
- `lib/countryAvailability.test.js`
- `lib/guestOpenPrintFulfillment.server.js`
- `lib/guestPrintCart.js`
- `lib/localDelivery.server.js`
- `lib/payments/pending.client.js`
- `lib/printManager.database.test.js`
- `lib/printManager.js`
- `lib/publicPrintDiscovery.server.js`
- `lib/shipping.database.test.js`
- `lib/shippingCountries.js`
- `lib/shippingCountries.test.js`
- `lib/shippingPayment.js`
- `lib/shippingPayment.server.js`
- `lib/shippingPolicies.js`
- `lib/shippingPolicies.test.js`
- `lib/shippingSettings.server.js`
- `supabase/migrations/20261202_global_shipping_policies.sql`
