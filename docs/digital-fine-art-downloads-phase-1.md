# Digital Fine Art Downloads · Phase 1

## Architecture audit

| Existing path | Phase 1 integration |
| --- | --- |
| Artwork editor and `artworks_discoverable` | Each variant references the original artwork ID. The editor adds a Carbon management panel. Checkout honors the same public artwork and series discovery rules as guest prints. |
| `artwork_prints`, cart and guest Open Editions | The guest flow provides the precedent for server-side snapshots and a session binding before redirect. Digital checkout accepts one digital variant ID and reads the price, currency, master and limit from a database snapshot. It uses its own Checkout Session and receipt. |
| `orders`, `order_items` and artwork fulfillment | Digital purchases and ticket issuance use dedicated tables and RPCs. Digital fulfillment has no shipping, inventory, ownership, provenance or certificate side effects. |
| Shared Stripe webhook | The existing signature verifier handles digital events first when the session carries the digital marker. Both immediate and delayed payment success use the same transactional fulfillment RPC. It matches the bound session, payment intent, amount and currency. A paid mismatch returns 500 for Stripe retry and reconciliation. |
| Guest Open Edition delivery and email | Digital guests receive a purchase-scoped HTTP-only cookie for the same browser. Signed-in purchases use the verified Supabase user ID. The receipt only reads the purchase and requests download tickets. Digital email recovery is a separate launch task. |

## Staging configuration

Vercel Git auto-deployment is disabled for the Phase 1 feature branch.

1. Apply `supabase/migrations/20261121_digital_fine_art_downloads.sql` to the staging project after the existing migrations. Keep both flags unset on production. Use only dedicated staging secrets and keep them in sensitive environment variables.
2. Set `ENABLE_DIGITAL_DOWNLOADS_ADMIN=true` to show the panel to a user with a verified `user_roles` admin record. Admin activation changes the eligibility of a variant. Checkout stays independently disabled.
3. In isolated staging, configure `NEXT_PUBLIC_SITE_URL` to the exact origin initiating checkout, use a Stripe sandbox key in `STRIPE_SECRET_KEY` and configure the matching `STRIPE_WEBHOOK_SECRET` on the existing webhook. Subscribe the endpoint to `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Leave delayed payment methods disabled in the sandbox until their flow is under test.
4. Enable `ENABLE_DIGITAL_DOWNLOADS_CHECKOUT=true` only for a controlled staging run. Checkout also rejects live keys and live sessions in code. Turning checkout off stops new purchases. Verified sandbox payments already in flight can still fulfill and existing buyers can still redeem tickets.

## File and purchase behavior

- JPEG and PNG masters up to 50 MiB and 160 megapixels are supported. The admin browser uploads to a signed staging key. The server fully decodes and validates the file and stores the original bytes under a fresh private master key. Upload capabilities cannot write master keys.
- Activation requires enough actual pixels on both sides for the configured millimetres and minimum PPI, in either orientation. The server and the database calculate each minimum as `ceil(mm × PPI / 25.4)`. Embedded PPI metadata cannot substitute for pixels. Exact A3 at 300 PPI requires at least 3508 × 4961 px. Smaller A3 vendor templates may need a lower configured PPI or a larger export.
- Replacement preserves existing purchases and in-flight checkouts by retaining the previously snapshotted master. A replacement for an active variant must meet its current specification. Variant edits and file promotion use a revision check to prevent concurrent overwrites.
- Checkout charges the configured MXN or USD minor-unit amount and disables Adaptive Pricing. Each payment is for one variant, with no mixed cart or buyer-supplied price, currency or quantity.
- A guest browser can reopen its purchase receipt for up to 30 days while it retains its purchase cookie. The receipt URL alone gives no access. A signed-in buyer can reopen the same receipt after authenticating. No email address or Stripe session ID serves as an authorization credential.
- Download claims reserve one of the configured slots immediately. A successful claim creates a two-minute, single-use URL on the JBU origin. A link that expires unused or a download interrupted after ticket issuance uses a slot. The app streams the private master with attachment and no-store headers. The client never receives a Storage download URL.
- Keep master keys referenced by variants or purchases. Staging uploads abandoned by the browser and expired ticket records need periodic cleanup. Retain paid purchase records for reconciliation and exclude ticket paths from third-party request logging or analytics where configured.

## Verification and approval gate

Run the automated image, feature flag, webhook and SQL tests from the repository root.

```sh
node --test lib/digitalDownloads/*.test.js tests/digitalDownloadsMigration.test.mjs
```

For the sandbox end-to-end run, create a draft variant from an existing discoverable artwork, upload a valid master, activate it and confirm that an undersized file or stale revision is rejected. In a browser console on the configured staging origin, start guest checkout with the active variant UUID.

```js
const response = await fetch('/api/checkout/digital', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ variantId: 'REPLACE_WITH_STAGING_VARIANT_UUID' }),
})
if (!response.ok) throw new Error(await response.text())
window.location.assign((await response.json()).url)
```

Complete sandbox payment, check the receipt and download bytes, retry the Stripe event, and verify another browser cannot use the purchase UUID alone. Verify unpaid and delayed-payment behavior, a signed-in buyer, ticket expiry and reuse, limit exhaustion, replacement after checkout, and direct Storage access denial. Confirm guest prints, originals, physical editions, auctions and provenance still use their existing paths.

The public catalog has no digital purchase button in Phase 1. Before live sales, approve the sandbox end-to-end run and decide guest email recovery, refunds and disputes, the customer-facing catalog entry, and operator retention and reconciliation procedures. The purchase has a revocation timestamp for reconciliation, with no automatic refund-to-revocation mapping in this phase.
