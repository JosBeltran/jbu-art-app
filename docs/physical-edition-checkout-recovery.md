# Physical Limited Edition checkout recovery

Artwork checkout and the collector's existing **Shipments and purchases** tab
now share Carbon pending-purchase cards in Spanish/English and Carbon theme
colors. Reload, reopen, focus and return from `?canceled=true` check the buyer's
persisted purchase. Returning from Stripe is informational and never requests
cancellation. Resume uses the verified original Stripe URL and numbered unit;
it does not recalculate shipping, destination, exchange rate or currency.

## API and inventory behavior

- `GET /api/checkout/physical-edition/status?artworkId=<uuid>` returns the
  authenticated buyer's active reservation, or latest terminal purchase for
  that artwork. Without `artworkId`, it lists that buyer's active reservations.
- `POST` to the same path with `{ "artworkId": "<uuid>" }` explicitly requests
  safe cancellation. Both methods validate bearer authentication on the server;
  browser-supplied hold/session IDs are ignored. Responses are private/no-store
  projections, excluding creation parameters, payment IDs and buyer identifiers.
- Open unpaid sessions resume their original Checkout. Cancellation expires
  Stripe Checkout and retrieves it again. A completion race leaves the unit
  reserved for fulfillment. Processing or unresolved payment state never permits
  release or a second purchase.
- Verified expired/unpaid sessions are released through the existing locked
  `expire_physical_edition_checkout_hold` transaction. A present PaymentIntent
  must be cancelled first or already cancelled; processing, action-required,
  succeeded and unknown states remain reserved. Database readback distinguishes
  expiration from concurrent paid fulfillment. A fresh purchase uses a new
  browser-generated request key.
- The existing paid webhook remains responsible for fulfillment and order email.
  Recovery reports paid/awaiting fulfillment and never creates a second order.
  Expiration webhooks now verify authoritative current Stripe state through the
  same recovery service. Existing originals, prints, auctions, certificates and
  normal cart fulfillment paths retain their existing contracts.

## Ambiguous and unbound creation

Migration `20261205_physical_edition_checkout_recovery.sql` adds a durable
Stripe request and a READY/STARTED creation fence. Preparation and safe unbound
cancellation lock the same hold. Once preparation starts, absence of a bound
session ID cannot authorize release. Retries replay the **exact original**
parameters and idempotency key only within 23 hours of preparation, inside
Stripe's minimum 24-hour retention window. Shipping binding is repaired before
exposing a resume URL.

Legacy unbound holds and older ambiguous requests use positive discovery from
Stripe's server-side session list, verifying hold/buyer metadata and payment
mode before binding. Each scan is bounded to 1,000 sessions in the creation
window. Finding no session does **not** prove that no payment exists. Such holds
remain reserved with a localized reconciliation message. An operator must
investigate them in Stripe; never release them on elapsed time or a failed API
request. This deliberately favors retaining a numbered unit over risking a
second sale of a paid unit.

## Optional abandoned-reservation reconciliation

`POST /api/cron/physical-edition-recovery`, authorized with
`Authorization: Bearer <CRON_SECRET>`, processes at most 25 elapsed HELD rows
through the same Stripe verification. It rotates `recovery_checked_at` so old
unresolved holds do not starve later reservations. The response contains counts,
not payment/customer data. Buyers' authenticated status reads and checkout
attempts also reconcile expired holds without waiting for expiration webhooks.

No scheduler is enabled by this change. After sandbox validation, an operator
may configure a job using the existing server secret and this POST endpoint.
Do not expose the secret to browser code. Inspect unresolved rows privately:

```sql
select id, artwork_id, status, stripe_session_id, creation_state,
       expires_at, recovery_checked_at
from public.physical_edition_checkout_holds
where status = 'HELD' and expires_at <= now()
order by recovery_checked_at nulls first;
```

## Rollout

This branch does not deploy, run migrations, reconcile production reservations,
or modify payment records.

Drain old checkout invocations before enabling the new READY fence: deploy the
new application first (physical checkout fails closed until the new schema is
present), let prior invocations finish, then apply migration 20261205. Keep old
application instances from serving physical checkout afterwards: older code
cannot participate in the durable preparation fence. Alternatively use the
existing deployment maintenance procedure to pause physical checkout while
updating both pieces. The migration changes schema/functions only and does not
release, pay, cancel or backfill historical holds. Stripe delivery retries cover
the brief schema transition. Configure the optional job separately.

Before production enablement, smoke-test with Stripe sandbox credentials and
actual signed webhooks: start/back/refresh/resume, cancel/retry, and payment
completion racing cancellation. No live payment credentials were used for the
automated validation in this change.

## Automated verification

```sh
node --test lib/physicalEditionRecovery.server.test.js \
  lib/physicalEditionRecovery.http.test.js lib/physicalEdition.database.test.js
node --experimental-vm-modules --test tests/checkoutShipping.test.mjs \
  tests/physicalEditionRecovery.test.mjs
npm run build
```

The focused tests exercise real HTTP authentication and buyer scoping, Stripe
state/race boundaries, durable original requests, unbound discovery, unavailable
Stripe, explicit cancellation/readback, SQL inventory allocation/idempotency,
protected paid fulfillment, both SQL transition orderings, and authenticated
scheduled reconciliation. PGlite serializes its queued transactions; the SQL
tests exercise both winners of the row lock rather than claiming a multi-server
PostgreSQL stress test. Shipping route tests execute the real checkout handlers
with in-memory Stripe/DB boundaries and real policy calculations.

The wider `lib` suite has two runtimes: Node tests use `node:test`; fourteen
files import `bun:test` and must run under Bun rather than Node. Five existing
Node tests intentionally skip. Dependency installation used `npm install
--ignore-scripts --package-lock=false` because the repository's existing lockfile
is out of sync; no dependency or lockfile changes are included.
