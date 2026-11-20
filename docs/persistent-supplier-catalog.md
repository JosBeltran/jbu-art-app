# Persistent Wall Art supplier catalog

## What changed and why

The old Product Studio discovered manufacturing records on demand, cached individual pages for five minutes in a process-local Map, merged only the loaded pages, and used artwork mockups as catalog pictures. Different instances or expired caches restarted discovery. The visible count described the loaded subset; local filtering could not search unseen records. UID parsing missed compound metric/imperial dimensions and standard paper formats. Manufacturing UIDs are **not** commercial product IDs; there is no supported inference that Gelato's commercial website count (including 34 cards) must equal an API result count.

Product Studio now reads a private Supabase supplier index. `provider_catalog_products` and `provider_catalog_variants` remain the canonical exact supplier identities used by existing candidate/mapping foreign keys. The new tables are revision snapshots and a derived group/search index, not another JBU commercial catalog. They create no JBU products, approved prices, assets, orders, or fulfillment jobs.

- `supplier_catalog_state`: active complete revision, last success and opt-in refresh schedule.
- `supplier_catalog_runs`: persisted source checkpoint, fenced lease, retries, timing, page count and change statistics.
- `supplier_catalog_entries`: normalized product/variant snapshots, original IDs/catalog, raw metadata, mm dimensions or explicit size code, exact configurations, image provenance and SHA-256 content fingerprint.
- `supplier_catalog_groups`: completed revision's commercial group metadata/search projection with a GIN full-text index, size/finish/frame summaries and manufacturing variant count.
- `supplier_catalog_image_permissions`: exact source URL approvals with human verifier, evidence reference and revocation switch.

Only service-role access is granted. The existing admin API still verifies the bearer user and their separate `is_jbu_admin` role. Provider keys remain server-side. Browsing and inspecting indexed configurations never construct a provider adapter. An explicit selected-SKU price estimate/quote remains a live operation with the existing semantics.

## Grouping and metadata

`normalizeSupplierEntries` uses structured provider attributes ahead of UID selectors. An explicit source commercial product/group ID, when supplied, takes precedence over the provider identity fallback. Prodigi otherwise retains its parent ID. Gelato's documented fallback strips known size, orientation and frame-color selectors inside recognized Wall Art families, retaining unknown tokens. It recognizes `A3`, cm/mm/in and compound metric/imperial labels. Unknown constructions remain separate rather than being merged into a false product.

Paper, substrate, frame material/profile and stretcher thickness distinguish constructions; dimension, orientation, frame color, glazing and finish remain configuration options. There is no target group count. Raw source records and grouping provenance remain available for acceptance review. Conservative fallback identities can still produce multiple similar titles when a supplier exposes no human-readable construction distinction; inspect source specifications rather than automatically merging unknown series. Credentialed supplier acceptance must resolve those ambiguities before production rollout.

Spanish and English titles/descriptions are controlled templates of reported specifications. Supplier prose is preserved as source description in technical details; it is not falsely presented as a verified translation. No certification, quality, popularity or availability claim is generated. Unreported market availability remains unverified. Missing reported combinations are displayed as unresolved and cannot be selected; a list of per-attribute options never becomes a fabricated Cartesian product. No numeric dimensions are invented for standard size codes. Prodigi display size labels are never converted to physical dimensions: its documented `50x70cm` label can represent a physical `508 × 711.2 mm` product; only source `dimensions` provides production measurements. A3 remains a size code when the source does not establish physical dimensions.

## Synchronization protocol

Each `advanceSupplierSync` invocation claims one provider lease for 90 seconds and processes **one source page**, then atomically commits its normalized records with the next checkpoint. Source calls have 10-second timeouts and a 2 MB JSON bound; pages have 25 records. Gelato search rows already carry exact manufacturing variants. Prodigi search queues parents in the checkpoint and exhausts each parent's variant pages before advancing source search. There is no supplier call from a page-load effect.

Leases use tokens checked again at commit/failure; an expired worker cannot publish over a replacement. A unique partial index prevents two active runs for the same provider. Replayed page writes are idempotent. Invalid/non-advancing/contradictory pagination, missing variants and an empty full catalog fail closed. No guessed poster-only fallback is marked complete. Source pagination is not a provider-side immutable snapshot: if the supplier changes its catalog during a scan, a subsequent full refresh may be needed to reconcile it. This worker does not claim transactional consistency from an API that does not document it. A 100,000-page protection limit fails the revision rather than publishing a truncated set. Overlapping source IDs are deduplicated by exact provider product/variant identity within the revision.

Transient network/429/5xx errors keep the checkpoint and use a persisted exponential delay (5, 10, 20, 40, 80 seconds), honoring a longer numeric or HTTP-date Retry-After, bounded at 24 hours. Five consecutive failures stop the run. Admin retry resumes the **same** run/checkpoint with a fresh bounded retry budget. Successful batches reset consecutive attempts but retain error counts and last recorded error. Permanent schema/auth/not-found errors require administrator inspection.

Only complete source exhaustion activates a revision. Publication of the group index, canonical provider upserts, unavailable flags, active pointer and diff statistics occurs in one database transaction. Removed provider records are retained and flagged unavailable, never deleted; JBU mappings remain valid references. Partial/failed staging rows are never browsable. Last-known-good remains readable throughout refresh/failure. Previous complete revisions are retained for inspection/rollback; there is intentionally no automatic destructive retention job.

Candidates pin the selected provider specification and semantic group. The save RPC uses pinned dimensions. A previously selected candidate whose source specification changed cannot silently become a different selection in the same session (`candidate_revision_changed`); open a new session to select the changed source. New selections from an outdated active revision return `supplier_revision_changed`; return to the catalog and refresh its local results. Existing saved products, prices and purchased snapshots are untouched.

## Initial population in staging

1. Use an isolated staging Supabase and existing admin identity/role. Back up first. Apply migrations through `20261215_persistent_supplier_catalog.sql` in order. Do not run this against production as part of PR review.
2. Configure the existing server `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, plus `GELATO_API_KEY`; configure `PRODIGI_API_KEY` before its provider acceptance. Never place supplier/service keys in `NEXT_PUBLIC_*` variables.
3. Open the existing **Product Studio**, choose artwork and destination, then expand **Manage catalog synchronization**. Choose **Synchronize catalog** for Gelato. The explicit admin action advances bounded batches while open; closing or pausing preserves the checkpoint. The catalog stays empty until the first complete revision. No fake seed catalog or live-browsing fallback is used.
4. To continue after closing the page, use the authenticated server worker below or choose **Continue / retry**. Inspect errors before retrying. Persistent invalid response/401/403 must be fixed at the provider/account rather than masked by a partial catalog.
5. Repeat with Prodigi. Its existing v5 parent/catalogue API access is account-dependent; a missing/unsupported endpoint is a failed run, not proof of an empty provider catalog. Confirm the installed account's API capability before enabling its schedule.

## Scheduling on the existing deployment

The application already uses opt-in authenticated HTTP cron workers (for example physical-edition recovery). The new `/api/cron/supplier-catalog` follows the same `CRON_SECRET` bearer contract and accepts GET (Vercel-compatible) and POST. It advances one batch for each of the two supported providers, sequentially, within a 60-second route budget. It also starts due opt-in schedules. It does not send supplier orders.

Configure the **existing deployment scheduler** to invoke this endpoint every 1–5 minutes using `Authorization: Bearer <CRON_SECRET>` stored as a scheduler secret. Match the cadence to the hosting plan. For Vercel Cron, add this path to the deployment's existing cron configuration with its supported schedule; Vercel sends the configured CRON_SECRET. No second task service, queue service or dependency is required. A bare endpoint without that deployment schedule cannot continue automatically after the browser closes.

After verifying worker invocation in staging, enable the provider's 24-hour schedule in the sync panel (or the authenticated `supplierSyncSchedule` operation with an interval of 1–720 hours). State records the next due revision. Starting a scheduled run advances next due time, preventing a permanently failed account from launching a new run on every worker tick. Active manual jobs are eligible for cron continuation even when automatic **new revisions** are disabled. All automatic new-revision schedules default to disabled. This PR does not configure a live scheduler, deploy, or merge.

## Imagery capability/permission audit

This environment has no Gelato/Prodigi credentials, no credentialed source payloads and no supplier licence grant. Public documentation inspection did not establish an imagery usage grant. [Prodigi’s published OpenAPI](https://www.prodigi.com/print-api/docs/openapi.yml) documents catalogue parents, variants, exact attribute combinations and region labels. Its CatalogueProduct/CatalogueVariant schemas do not publish representative product-photo fields; `UpstreamProduct.imageUrl` belongs to connected-store data. Asset mockup generation is documented separately and is not supplier product photography. No asset/mockup API was invoked or added to this workflow. [Gelato product search](https://dashboard.gelato.com/docs/products/product/search/) and [product detail](https://dashboard.gelato.com/docs/products/product/get/) document manufacturing IDs/attributes, dimensions and supported countries, without a representative-photo field. Its Ecommerce product preview URLs belong to a store integration, not this manufacturing index. Credentialed account capabilities and usage rights still require verification. Consequently **no live image capability or commercial-use permission is claimed as verified**.

The existing adapters accept bounded HTTPS image references when an actual API response supplies `images[].url`, string images or `imageUrl`. They record source=`supplier_api`, kind=`supplier_reference`, permission=`unverified`, alongside raw metadata. They do not invent a render API or scrape unrelated website images. If the account API has another documented shape, add a captured, sanitized fixture and adapter test before using it. No reference alone authorizes display.

Until a human verifies supplier usage rights, cards show an explicit consistent placeholder. JBU artwork mockups only appear in the configurator/mockup step, labeled as approximate JBU previews. Verified commercial renders and production assets remain in their existing Product Manager flows.

After supplier verification, a privileged operator can approve **an exact API-provided URL**, with the actual licence/support evidence reference and their admin Auth UUID:

```sql
-- Replace all placeholders using the verified supplier response and permission evidence.
insert into supplier_catalog_image_permissions(provider_code,image_url,permission_reference,verified_by)
values ('gelato','https://verified-supplier.example/actual-product-photo.jpg','Actual licence/support reference','00000000-0000-4000-8000-000000000000')
on conflict(provider_code,image_url) do update
set permission_reference=excluded.permission_reference,verified_by=excluded.verified_by,verified_at=now(),enabled=true;
```

Browsing joins approvals against the current source references and provider. Changing URLs requires new approval. Setting `enabled=false` revokes display; a broken approved image also returns to the explicit placeholder. There is no default host-wide permission, downloadable production file, artwork render or image certification inferred from this record.

## Acceptance and verification

Automated fixtures validate Gelato multi-page activation/resumption, compound sizes, semantic grouping, fencing, last-known-good on failure, Retry-After/backoff/exhaustion, changed/removed records, candidate dimension pinning, private RLS/RPC privileges, and Prodigi parent + variant pagination/exact configurations. These are contract fixtures, **not a successful live supplier sync**.

Run:

```sh
node --test lib/productCatalog/*.test.js
npx eslint lib/productCatalog/*.js components/admin/productCatalog/SupplierCatalogBrowser.jsx components/admin/productCatalog/StudioConfigurator.jsx app/admin/product-studio/UnifiedStudio.jsx app/api/cron/supplier-catalog/route.js tests/supplierCatalog.browser.cjs
npx tsc --noEmit
npm run build
```

The optional isolated Playwright/esbuild runner `tests/supplierCatalog.browser.cjs` bundles the actual UnifiedStudio, Carbon controls and configurator, substituting only auth/localization/network fixtures. Set `PLAYWRIGHT_MODULE`, `ESBUILD_MODULE` and optionally `CHROMIUM_PATH` to installed browser tools. It verifies English desktop/light and Spanish mobile/dark, server pagination/search inputs, missing-image placeholders, preserved filters, exact indexed supplier selection and zero supplier discovery requests during browsing. It also verifies that an explicit admin synchronization action starts and advances a bounded job. `JBU_VISUAL_DIR` optionally saves screenshots. The dedicated CI workflow installs the tools in `/tmp`, without changing application dependencies.

Before production acceptance, record: source catalog IDs and all source page totals; complete DB run and revision IDs; normalized group/variant counts; source-vs-commercial construction review (including duplicate-title review); two real size/frame/paper configurations resolving to source IDs; full-index search on later source pages; restart with zero source reads; 429/failure recovery with an active prior revision; image permission evidence or explicit placeholder; cron progression after browser close; Product Manager/Fine Art Prints publication/cart/checkout regression. No real checkout, published price change or supplier order is required to review this PR.

## Rollout and rollback

Apply the additive schema **before** the new app. Populate and accept staging first, then deploy only after authorization. Keep schedules disabled until account access, metadata and worker cadence pass acceptance. Initial deployment can browse empty state and continue existing Product Manager flows.

To stop synchronization, disable schedules and stop the configured worker, then allow any in-flight lease to expire; paused jobs/checkpoints remain. Disable image approvals separately if rights change. To roll the application back, restore the preceding application release and retain these additive tables/columns; do not drop supplier rows or rewind JBU prices/products/orders. To select a previous known-good index for inspection, stop workers, verify a prior **complete revision for the same provider**, and update `supplier_catalog_state.active_revision`/`last_success_at` in one privileged transaction. This changes private browsing only; canonical provider records remain retained, candidate snapshots stay pinned, and no order/price is rewritten. Start a new full sync for a normal forward recovery.

Do not run destructive down migrations after candidates reference revisions. Inspect retained revision counts/storage during staging and set a separately reviewed archival policy after measuring actual account size.
