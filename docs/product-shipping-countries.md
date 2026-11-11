# Product shipping countries

## Purchasing audit and storage

- `artworks` is the purchasable original or numbered physical edition. Store its optional `allowed_shipping_countries` there.
- `artwork_prints` is the purchasable size/finish variant for Open and Limited Edition prints. Each variant has its own restriction, independent of the original. The repository has no separate merchandise catalog or digital download checkout; no parallel catalog was added. Products represented by an existing physical variant use that variant's field.
- Open Edition guests use `/api/checkout/open-edition`; registered original/print carts use `/api/checkout`; numbered physical editions have their existing hold/bind flow. Auctions and accepted offers share `auctionCheckout.server.js`. All resolve shipping from database rows.
- Registered checkout and its webhook already support mixed original/print product snapshots. The cart's separate-purchase guard prevented that supported flow; it is removed so compatible mixed carts can use authenticated checkout. Anonymous checkout remains Open Edition print only.
- Points purchases and certificates retain their existing digital behavior. Local delivery retains its address, pricing, calendar, reservation and payment logic; both the server quote and locked creation RPC now enforce MX eligibility for newly restricted originals.

`NULL` and `[]` mean no product-specific restriction. Intersect only non-empty physical restrictions. If none exist, use `MX, CA, US`. A restricted item can introduce GB regardless of the fallback list. Digital items do not participate. The migration adds nullable columns without backfilling records or changing prices; constraints reject invalid, lowercase, duplicate or null ISO entries.

The existing artwork create/edit forms and print variant manager expose the optional Carbon multiselect with localized country names. Existing null values stay null on an unrelated edit. The print save RPC preserves restrictions when an older caller omits the property.

## Shipping coverage and rollout

The audited checkout architecture includes shipping in product prices. It has no `shipping_options`, Stripe shipping rates, carrier API or destination-based rate table. Keep that architecture: no shipping rate or surcharge is introduced.

`JBU_INCLUDED_SHIPPING_COUNTRIES` is **server-only operational coverage**, separate from product restrictions and the fallback destinations. If unset, it preserves existing included shipping to `MX,CA,US`. Before enabling UK fulfillment, confirm packing, address handling and the fulfillment method for **every physical item** that can be in the UK cart, then configure:

```dotenv
JBU_INCLUDED_SHIPPING_COUNTRIES=MX,CA,US,GB
```

This variable asserts that existing included-shipping fulfillment supports those destinations; setting a product restriction alone never makes that assertion. Every resolved destination must have coverage. An unsupported or malformed configuration returns `shipping_configuration_unavailable` before creating a Stripe session, guest snapshot or edition hold. Nothing falls back to an incompatible shipping rate. No prices change automatically.

1. Apply `supabase/migrations/20261201_product_shipping_countries.sql` after the existing migrations. No live migration is applied by this change.
2. Configure additional coverage only after verifying fulfillment; keep existing destinations in the coverage list.
3. Set a product/variant restriction in its existing admin form. Leave other products empty.
4. Verify in Stripe test mode that GB-only checkout shows only United Kingdom and that an incompatible cart is rejected. Existing guest/edition feature flags remain authoritative.

Existing Stripe sessions already handed to buyers are immutable; this change governs new sessions and prevents returning an existing numbered-edition/auction session with different destinations. It does not retroactively expire all previously issued sessions. Review outstanding sessions when changing restrictions or coverage.

## Verification

```sh
node --test lib/shippingCountries.test.js lib/guestPrintCart.test.js lib/printManager.test.js lib/guestPrintPayment.test.js lib/stripeCharge.test.js lib/localDelivery.test.js lib/localDeliveryInput.test.js
node --test lib/printManager.database.test.js
node --test lib/localDelivery.database.test.js lib/localDelivery.permissions.test.js
node --experimental-vm-modules --test tests/checkoutShipping.test.mjs
npx tsc --noEmit --incremental false
```

The handler tests execute real checkout handlers with mocked DB/Stripe boundaries and include forged country inputs, mixed carts, anonymous Open Edition, authenticated Limited Edition, numbered-edition holds/session reuse, auction Buy Now and digital points. Database tests apply the actual migration and exercise variant persistence, invalid values, existing fulfillment and local reservations. Unit tests cover the full intersection matrix, coverage failures, country names and digital exclusion.

Live Stripe/Supabase credentials are not required for these tests. This does not replace a staging purchase with the deployment's real shipping operations and Stripe settings.

Validation also passed in headless Chromium against the actual Carbon field, cart context and notices: country search/selection, English and Spanish names/messages, and rejecting a US item after adding a UK item without removing the UK item. The temporary browser fixture is not part of the application. TypeScript passed. Existing repository lint errors were compared against the base commit; this change introduces none.
