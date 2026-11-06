# JBU — Guest Open Edition Checkout: Impact & Staging Rollout

> **REVIEW ONLY — NOT READY FOR PRODUCTION.**
> Branch: `feature/guest-open-edition-checkout-20261105` / draft PR #35.
> Feature flag defaults OFF. No migration or email has been executed by this work.

## Verified against current main (code inspection)

- `CartContext` previously persisted items directly in `cart_items` only for logged-in users. Its unique conflict target (`user_id,artwork_id`) could not distinguish print variants, and cart hydration priced every line from the **artwork original**.
- `/api/checkout` previously sourced print price from the client; only originals were repriced from the database. The `userId` request field was accepted for metadata without proving the user's identity. The branch guards this legacy endpoint.
- `artwork_prints` manager uses `id,artwork_id,size,finish,price,edition_type,is_active`, with `edition_type=OPEN|LIMITED`. The print UI already has `selectedPrint.id`.
- `fulfill_stripe_order` (20261110) inserts generic `order_items` and treats PRINT only via artwork-level `print_type`; it does **not** write variant ID, size or finish, and calls `complete_order_originals`. It is unsuitable for anonymous Open Editions.
- `orders` and `order_items` base CREATE TABLE and most RLS policies are not included in repository migrations. Real column nullability, DB triggers, constraints, and registered print cart constraints **are not yet verified**. Run the supplied read-only schema audit first.
- Existing `sendOrderConfirmationEmail` mentions collectible ownership and authenticity certificates; guest print confirmation therefore requires a separate template.
- Existing `/api/orders/[id]` checks authenticated purchaser or admin; guests require a separate bearer-token route.

## Implemented in draft branch

- `lib/guestPrintCart.js`: minimal localStorage identifiers, composite identity, canonical variant checks.
- `CartContext`: persist OPEN print variant IDs locally for anonymous or registered visitors; refresh live price/variant metadata via public, minimal API. Existing originals remain in Supabase.
- `/api/checkout/open-edition/variants`: public GET of active OPEN print display data only (no personal information).
- `/api/checkout/open-edition`: gated Stripe Checkout, service role fetch of active OPEN variants, locked MXN prices and server FX, name/address/phone capture, record checkout manifest and 256-bit guest bearer token. No signup or collector role.
- Signed Stripe webhook routes `guest_open_prints=v1` to `processGuestOpenPrintWebhook`; matches actual Stripe line totals and quantities to server snapshots, then calls an isolated transactional RPC. Never calls original-artwork completion, provenance or certificate functions.
- Order lookup requires secret guest token. Access can be revoked by changing/deleting the corresponding token hash.
- Dedicated certificate-free bilingual guest confirmation email; pending email send does not undo order.
- Guest success only shows confirmation after Stripe payment **and** order persistence can be read. Legacy success flow remains unchanged.

## Proposed migration (NOT EXECUTED)

`supabase/migrations/20261119_guest_open_print_checkout_PROPOSED.sql`

1. New narrow table `guest_open_print_checkouts` (server-only): frozen variant manifest, Stripe session, SHA-256 access token digest, order link and email outbox status. Required for reliable multi-variant session metadata beyond Stripe's 500-character per-field limit.
2. Allow `orders.buyer_user_id IS NULL`; leave purchaser email, name, shipping and paid amount in existing order table.
3. Add `orders.production_status` and `order_items` variant/size/finish/product-type snapshots.
4. Server-only, idempotent `fulfill_guest_open_print_checkout` RPC: locks checkout row by Stripe session, requires paid webhook-provided verified amount, copies server-side snapshots, inserts order and print items, never modifies original artwork ownership or issues certificates.
5. **Migration impact MUST be checked** against existing `order_items` triggers (including physical limited edition restrictions), order checks, nullable columns, RLS and email automation triggers. Do not execute blindly.

## Production schema audit received (2026-11-06)

Based on the operator's read-only JSON output, **not on hypothetical migrations**:

- `orders.buyer_user_id` is **already nullable**. The proposed migration was updated to avoid a redundant `ALTER ... DROP NOT NULL`.
- `orders.stripe_session_id` and `orders.stripe_payment_intent_id` each have UNIQUE constraints. `order_items.order_id` is NOT NULL. Original-order status is an enum `order_status` and the existing `PAYMENT_RECEIVED` default is compatible.
- `artwork_prints` has **two availability flags**: `is_active NOT NULL DEFAULT true` and `is_available NULL DEFAULT true`. Both must allow checkout (explicit false means unavailable); checkout and public variant lookup now validate both.
- `cart_items` has UNIQUE(user_id, artwork_id), no print_variant_id. Multiple variants for the same artwork cannot be represented without migration or separate storage; login reconciliation is **not complete**.
- `orders` has triggers `orders_notifications` and `trigger_award_xp`. `order_items` has `block_unimplemented_physical_edition_sales`. The uploaded audit includes only trigger declarations, **not function definitions**, so guest-safe behavior cannot be confirmed. Use `scripts/audit-guest-open-print-trigger-bodies.sql` before enabling.
- `orders` and `order_items` RLS is enforced; ordinary anonymous users have no direct order read policy. The guest-order API must keep its service-role/token authorization and never grant public SELECT on those tables.
- `artwork_prints` includes an unusually broad authenticated ALL policy. This is **pre-existing** and out of scope; do not broaden it or rely on it to secure a checkout.
- The migration proposal adds a dedicated server-only checkout table, order item print snapshots and print production status. It remains **unexecuted**.
- Audit also confirms no pre-existing `guest_open_print_checkouts` table in the supplied inventory.

### Security fix from review

The first draft returned `/guest-orders/{secret}` to anyone with only a valid Stripe session ID. This was unsafe: a Stripe session ID is not buyer authorization. The draft now requires the independent 256-bit token stored in the initiating browser's sessionStorage before returning the order link, or the buyer receives the link by email. The public status endpoint without the token may report `paid` but **never releases the secret**.

### Still missing before activation

Actual trigger function definitions, logged-in cart print variant persistence/reconciliation, full staging database and Stripe webhook integration, and email retry/verification tests. The current draft must not be merged.

## Trigger definitions reviewed from Supabase CSV (2026-11-06)

Full definitions for the three missing triggers are now available, not just trigger signatures.

1. **`trigger_award_xp` / `award_xp_on_order_success`**: awards `FLOOR(order.total_amount_mxn)` XP to ANY profile matching the buyer's email, and marks `xp_awarded=true` even if no profile was actually changed. This would wrongly award XP to an existing collector buying as a guest. The proposed migration introduces `orders.order_origin='OPEN_PRINT'` and an early return for that specific origin, preserving existing XP behavior for `STANDARD` orders.
2. **`orders_notifications` / `order_notification_event`**: looks up an existing, email-confirmed `auth.users` record by purchaser email and enqueues `/orders/{id}` collector notifications. This is not the guest token URL and could create unrelated collector notifications. The scoped `OPEN_PRINT` origin bypasses that trigger only for guest/Open Edition print purchases; the dedicated Resend receipt remains separate.
3. **`block_unimplemented_physical_edition_sales`**: unconditionally rejects `order_items` referencing artworks with `physical_edition_type='LIMITED_EDITION'` unless there is an authorized physical numbered-unit sale. This incorrectly treats an **Open Edition print of that artwork** as a numbered physical sale. The proposed migration introduces a *restricted* `OPEN_PRINT` branch only during the isolated transactional fulfillment; original numbered edition validations are retained unchanged.

**These are proposed, reviewable SQL function changes and have NOT been applied to Supabase.** Before deployment verify both normal-order trigger behavior and Open Edition prints of a physical limited-edition artwork in an isolated staging database.

## Release blockers

- Run `scripts/audit-guest-open-print-checkout.sql` in **staging** (read-only); inspect schemas, triggers, indexes, grants and definitions. Adjust proposed migration before applying.
- Confirm behavior of pre-existing registered LIMITED print cart entries (`cart_items` has no known variant key) and mixed carts. These are not yet fully supported by the new guest-print-only fulfillment path. Do not change production registered checkout without resolving.
- Verify there are no order triggers issuing collector certificates for `OPEN_PRINT` rows.
- Validate expiry/cancel/refund handling, exact payment amounts with both currencies, concurrent webhook retries, and status/email after crashes.
- Authenticate and test order-link revocation, token confidentiality and expiration/retention policy.
- Run full Next.js build/typecheck plus Stripe Test Mode and Supabase staging integration. No real email in test: set `DISABLE_TRANSACTIONAL_EMAILS=true`.
- Existing features like auctions, offers, COD, physical edition unit checkout, original ownership, certificates and prints from limited original artworks must be regression-tested.

## Required environment variables

Existing: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (server only),
`STRIPE_SECRET_KEY` (use `sk_test_...` for staging),
`STRIPE_WEBHOOK_SECRET` (test endpoint, unique to staging),
`NEXT_PUBLIC_SITE_URL`,
`RESEND_API_KEY`, `RESEND_FROM_EMAIL` (production only).

New: `ENABLE_GUEST_OPEN_EDITION_CHECKOUT=true` **only in isolated staging** after migration. Omit or set `false` in production until approved.
`DISABLE_TRANSACTIONAL_EMAILS=true` in staging. **Do not pass real recipient email addresses to test payment sessions.**

## Stripe Test Mode manual staging walkthrough

1. Create separate Supabase/Vercel Preview, apply reviewed migration only there, configure `sk_test`, test webhook and a sandbox email.
2. Open artwork in guest/incognito, add an active OPEN variant and refresh. Verify same variant/size and DB-priced MXN/USD.
3. Remove it; add two distinct OPEN variants. Try a non-existent/disabled/LIMITED variant and an ORIGINAL against the new checkout endpoint: must reject.
4. Initiate guest checkout, confirm Stripe's actual amount, selected currency, name/shipping data. Use Stripe test payment method; do not use live charges.
5. Send signed `checkout.session.completed` with `payment_status=paid`, then resend: exactly one order, item per variant, no original ownership/provenance/certificate changes. USD must match frozen server FX.
6. Verify email outbox (with test emails disabled), secure order lookup, tracking display and revoked token. Test a second independent order and confirm no cross-access.
7. Try failed/cancelled/unpaid checkout: no paid order. Simulate a failing DB RPC: webhook must return 5xx, and retry should recover without a duplicate.
8. Check logged-in original, pending auction, offer, COD, existing certificates and limited editions. Confirm all unchanged.
9. Only after the full suite succeeds: review the proposed migration and PR for controlled deployment. Do not merge automatically.

## Test coverage status

`lib/guestPrintCart.test.js` unit tests are run in GitHub Actions: minimal guest storage, JSON refresh, duplicate/composite keys, removal, limited/original denial, variant ownership/active checks, price tampering, invalid quantities, and restricted local data.

**Not yet demonstrated**: browser-based CartContext tests, real Stripe webhook integration against migrated Supabase, SQL trigger audit, receipt send/retry, two-customer isolation, or complete CI build. These require staging and must not be represented as passed.
