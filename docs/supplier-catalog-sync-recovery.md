# Gelato queued synchronization: diagnosis and safe continuation

## Verified findings

Audit baseline: main at merge commit `6b0e810` (PR #81). The repository has no `vercel.json`, no supplier schedule registration, and no source definitions for the reported cleanup/daily-digest/trial-reminder/sitemap-refresh schedules. Those names cannot be treated as a trigger for this worker.

The existing endpoint is **GET or POST `/api/cron/supplier-catalog`** in `app/api/cron/supplier-catalog/route.js`. It verifies `Authorization: Bearer <CRON_SECRET>`, then calls `scheduledSupplierSync` in `lib/productCatalog/supplierSync.server.js`. This advances one bounded batch per provider. The other executor is the authenticated admin `supplierSyncAdvance` operation in `/api/admin/product-catalog`, driven by the explicit browser sync loop every five seconds. Ordinary browsing/status polling does not advance jobs; the explicit sync loop ends when its tab closes/pauses.

An unauthenticated, read-only probe of `https://www.josuebeltranuresti.com/api/cron/supplier-catalog` returned **401 with `{"error":"unauthorized"}`**. The main commit also has a successful Vercel status pointing to `jbu-art/jbu-art-app`. This establishes route presence, not a configured CRON_SECRET, an authorized worker success, the exact production alias commit, or a running Vercel schedule. No authenticated Vercel management access, production Supabase connection or supplier credentials are bound in this execution environment. The missing repository schedule is confirmed; a separate dashboard/external schedule cannot be ruled in/out without its configuration or invocation logs. The later 46 committed batches mean an executor did run; this is not evidence of a permanently broken checkpoint.

Reported production run:

- UUID `44ab91a4-9973-4b5f-9ad6-9e604b42d33a`, Gelato, `queued`.
- `pages=490`, `attempts=0`, `errors=4`, `last_error=provider_unreachable`.
- `next_attempt_at=2026-11-20T09:12:08.494388+00:00`, `stats={}`, no active revision or last success.
- A later read-only observation reports **536 batches, 13,266 indexed variants, 801 staged groups, attempts=0, errors=5, null lease, eligible=true**, and checkpoint `catalog=7`, `offset=4450`, `nextSearch=4450`, `pending=[]` across **12 catalogs**. That is the eighth source catalog, not a reset to the first. These observations establish substantial resumed work. They do not identify which trigger invoked it or certify every historical page/group.

## What the fields establish

`claim_supplier_catalog_batch` in migration `20261215_persistent_supplier_catalog.sql` already checks `next_attempt_at <= now()` **and** an absent/expired lease. This check remains in place. The read-only diagnostic compares the reported timestamp against the database clock; a due timestamp permits work but does not invoke a worker. A future lease still prevents a claim.

`pages` increments only in the same SQL transaction that commits the normalized records and next checkpoint. Failed requests do not increment it. It includes the initial catalog-list batch and source batches which may contain overlapping or out-of-scope records, so **490 means 490 committed batches, not 490 unique pages and not 490 failures**. Unique staged variant count and current catalog/offset must be inspected together. No historical per-page ledger exists for those original batches; the counter alone cannot prove that a supplier honored offsets.

`errors` is cumulative, while `attempts` resets after a successful batch/manual retry. `last_error` remains historical after recovery. An error moves a run to `retry` or `failed`; a successful commit or explicit resume can leave it `queued`. Thus four historical `provider_unreachable` errors and `attempts=0` do not establish a current timeout loop. Existing provider requests use a 10-second timeout and collapse timeout/network failures into this same code. Without invocation logs, their cause cannot be separated. Increasing the timeout is not justified by this snapshot.

`stats={}`, no active revision and no last-success timestamp are expected until **all catalogs and all source pages** are exhausted. Activation, final statistics and canonical supplier updates occur atomically only after a nonempty full revision is validated. A stopped executor can therefore leave thousands of valid staged rows while browsing still has no active catalog.

## Small fix, no run reset

1. Add a production Vercel cron declaration for the **existing** endpoint every minute. Keep one source batch per provider/request, the 10-second source timeout, 60-second function budget, five-attempt retry bound and persisted next-attempt/lease checks.
2. Add nullable `supplier_catalog_state.last_worker_at` and `supplier_catalog_runs.last_error_details` fields and extend the claim/failure observability functions to stamp invocations, including idle/backoff claims. This timestamp includes both cron and admin invocations; it is not itself proof of an automatic schedule. After closing the admin tab, minute-by-minute changes verify the external trigger. Run-lock then state-lock ordering matches activation.
3. Report current queued/retry/lease eligibility, unique staged variants, current source checkpoint, last committed source offset/time, worker heartbeat and historical errors separately. Log structured worker results under `[supplier-catalog-worker]`; provider/DB failures return HTTP 503, not a misleading 200.
4. Persist a bounded window of the last 16 source-page ID signatures alongside the existing checkpoint. Reject repeated IDs in the same source scope even when its numeric offset increases. This detects consecutive repeats/short cycles prospectively; it cannot reconstruct or certify the original 490 pages. Retry failures do not commit the provisional checkpoint/signatures. On a detected repeat, keep all staged records and the last good checkpoint, mark the run failed, and require inspection of the provider response before retrying. It is unsafe to activate a known looping source.

No migration resets a run, updates its page/error counts, clears its checkpoint, deletes indexed rows or changes product mappings. The additive migration adds nullable observability columns, replaces the claim function, and adds a lease-fenced diagnostic wrapper around the existing failure RPC. Older in-flight failure callers keep their deployed RPC signature. Commercial products, prices, Fine Art Prints, Checkout and supplier order submission are unchanged.

## Read-only production inspection

Run [`sql/inspect-supplier-catalog-run.sql`](sql/inspect-supplier-catalog-run.sql) in the existing Supabase SQL editor. It works **before** this fix is installed, uses the exact run UUID, and returns checkpoint, lease, next attempt, eligibility, staged variants and groups. Save the result before rollout. Do not run `start_supplier_catalog_sync`, update a run to zero, clear a checkpoint or create a new run to troubleshoot this queued run.

After the heartbeat migration, this additional query is also read-only:

```sql
select provider_code, last_worker_at, active_revision, last_success_at
from public.supplier_catalog_state
where provider_code = 'gelato';
```

Compare two observations after closing the admin tab: a changing worker heartbeat but no page progress plus a future next-attempt is backoff; a live lease is work already claimed; an eligible queued run with no new heartbeat points to the executor/trigger; repeated source signatures identify pagination trouble. A historical error without a new attempt is not a fresh timeout. If Vercel logs a source failure, check its invocation duration and supplier diagnostics before changing timeout settings.

## Exact Vercel configuration

The new root `vercel.json` contains:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/supplier-catalog", "schedule": "* * * * *" }
  ]
}
```

This is the existing Vercel HTTP Cron mechanism, still supported alongside the newer Schedules product. The user confirmed **Vercel Pro**, so the one-minute cadence is supported. It requires **Pro/Enterprise** for minute-level cron. Hobby's once-daily legacy cron cannot provide timely page/retry continuation; use an authorized minute-capable scheduler calling the same authenticated endpoint if remaining on Hobby. Do not claim a daily single-batch invocation will finish a large catalog promptly. See [Vercel cron setup](https://vercel.com/docs/schedules/cron-jobs/quickstart) and [plan limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing).

Required **Production** environment bindings in the existing `jbu-art-app` project:

| Name | Purpose |
| --- | --- |
| `CRON_SECRET` | Private random bearer secret. Vercel Cron supplies `Authorization: Bearer <CRON_SECRET>` automatically. The route rejects missing/mismatched values. |
| `NEXT_PUBLIC_SUPABASE_URL` | URL of the existing production Supabase containing this run. |
| `SUPABASE_SERVICE_ROLE_KEY` | Private server-side service key for that same Supabase. |
| `GELATO_API_KEY` | Private Gelato catalog key for this Gelato run. |
| `PRODIGI_API_KEY` | Required only if there is an active/due Prodigi run to process. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing application/admin authentication binding; the cron worker itself does not use it. |

**Recovery policy:** keep `SUPPLIER_CATALOG_START_SCHEDULED_RUNS=false` (or unset). The cron defaults to continuing existing runs only, even if a prior database schedule flag is enabled. It will not create a new periodic Gelato revision after this run completes. Do not change the stored schedule settings during recovery. This is an optional non-secret policy setting; do not set it to true for this recovery. No `VERCEL_TOKEN` runtime secret is required. Never put supplier/service/cron secrets in `NEXT_PUBLIC_*` variables. Setting secrets only in Preview does not update Production. Changed environment variables require a new production deployment.

Rollout after authorization:

1. Save the read-only run snapshot. Apply `20261216_supplier_catalog_worker_heartbeat.sql` to the **same** Supabase first. Do not replay the older catalog-creation migration or seed/reset production records.
2. Confirm the Vercel project Root Directory points at this Next.js repository root, the production branch/alias uses the intended commit, and the Production bindings above are present. Compare any authoritative external/deployment configuration with the checked-in manifest. Preserve other schedules; this repository does not contain definitions for the four unrelated names, so do not invent, remove or replace them.
3. Deploy this reviewed change to **Production**, with the cron declaration enabled. Preview deployments do not register recurring production cron invocations. No production deployment or schedule mutation was performed during this fix.
4. In Vercel, verify the actual target **`/api/cron/supplier-catalog`**, expression **`* * * * *`**, UTC, and function limit **60 seconds**. Inspect this target/path, not a generic schedule name. If using an existing external HTTP scheduler instead of Vercel Cron, use this same public production URL, GET, every minute and the bearer header from a private secret binding; do not configure both triggers. Keep the existing unrelated schedules.
5. Verify authenticated invocations in production logs and the database heartbeat after the admin tab closes. An unauthenticated 401 proves only route presence. 401 from the scheduler means a missing/wrong bearer secret; 404 means wrong deployment/path/project; 503 requires inspecting the stored run error/logs; an idle result can mean no eligible work or a live lease.
6. The existing `queued` run is claimed at its stored checkpoint when due. **Do not restart it.** `schedule_enabled` controls starting future full revisions; it is not required to continue this already queued run. Leave that setting unchanged while recovering this run. Capture its preserved UUID, increasing counter, retained staged rows, and eventual `complete`/`active_revision`/last-success timestamps as acceptance evidence.

The tests reproduce a queued run with **490 committed batches**, four recorded errors and an existing staged variant: an early invocation makes zero supplier requests and preserves its next-attempt value; a due invocation resumes at offset 12225, adds a valid final source page, retains the original row, increments to 491 and atomically activates the **same UUID**. These are isolated database fixtures, not a claim that production has completed.


## Diagnosing the five historical network failures

Those errors cannot be retrospectively classified from `provider_unreachable` alone. For future **catalog reads only**, retain an allowlisted category (`timeout`, `dns`, connection reset/refused, TLS or network), phase (`headers`/`body`), safe network code and elapsed batch milliseconds. Persist the details through the same lease fencing as the failure transition and include them in the worker result/logs. The previous error message, request URL, headers and credentials are never retained. The 10-second timeout is unchanged. A response-body timeout now enters the existing resumable retry budget instead of escaping as a raw body-read exception. The supplier order request path and its error behavior are unchanged.

## Reviewing the 801 staged groups

The observed 13,266 variants across 801 keys do not establish 801 correct commercial products. The active group table is still empty until activation, so audit **supplier_catalog_entries** for this run using [`sql/audit-staged-supplier-groups.sql`](sql/audit-staged-supplier-groups.sql). The query covers all staged groups and exposes family/construction consistency, identical-title/construction keys, size/frame-color option counts and actual source UID samples. It makes no writes.

Review `family_values > 1` or `construction_values > 1` as inconsistent merges. Review `group_keys_same_title_construction > 1` for possible over-segmentation. Identical titles alone do not justify merging: conservative unknown UID tokens can encode a legitimate material/profile distinction. Existing tests retain dimensions/orientation/frame colors as options and distinguish paper/substrate/frame constructions, but fixture tests cannot certify these 801 live groups without their source fields. Do not force 34 groups or rewrite existing records based on the count. The full live group-content audit remains pending the read-only result; no commercial regrouping or source-index rewrite was performed here.
