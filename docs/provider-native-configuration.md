> Commercial discovery/configuration now uses the versioned presentation layer described in [commercial-presentations.md](commercial-presentations.md). Its category and presentationId API requirements supersede the earlier catalog-card workflow below.

# Provider-native Wall Art configuration

## Result and migration boundary

Product Studio uses provider catalog metadata and bounded on-demand configuration. It does not query `supplier_catalog_state`, `supplier_catalog_entries`, `supplier_catalog_groups` or completed sync revisions for normal discovery/configuration. Empty/absent cache and `active_revision=null` are supported. The existing seven stages are artwork, analysis, presentation, configuration, mockups, editorial/pricing, review/save; there is no second wizard or storefront.

JBU's existing product is the curated commercial offer associated with artwork. Its variants are explicitly selected configurations. Exploring a provider configuration creates neither. Only metadata cache/session records exist during browsing; the explicit Add configuration action pins a selected candidate, and final Save uses the existing atomic `save_wall_art_studio` RPC to create product drafts, variants, mappings and draft prices. Existing publication, commercial-image verification, production-file validation, mapping approval and Price Book approval remain mandatory.

No history is dropped/reset/re-normalized. The Gelato run and its 13,266 staged records/801 keys remain historical data, not a prerequisite or a new commercial authority. This branch targets main directly and does not depend on PR #82. Keep #82 draft: its exhaustive-sync cron and additional job administration should not be merged unchanged into this architecture. Retained from that work: bounded requests, existing Retry-After/error propagation, safe catalog-only network phase diagnostics, body-read failure handling, and exact/pinned supplier identity. Existing lease/idempotency protections remain on the preserved legacy worker; no new exhaustive cron is installed here.

## Provider API audit

Official contracts inspected before implementation:

| Capability | Gelato | Prodigi |
| --- | --- | --- |
| Discovery | [Catalog list](https://dashboard.gelato.com/docs/products/catalog/list/), actual supported catalog IDs; minimal JBU Wall Art presentation labels | [v5 reference](https://www.prodigi.com/print-api/reference/v5/) redirects to [current docs](https://www.prodigi.com/print-api/docs/). Its [published OpenAPI](https://www.prodigi.com/print-api/docs/openapi.yml) documents `/catalogue/products?category=wall-art` and descendant categories; rows are provider parent products |
| Definitions | [Catalog detail](https://dashboard.gelato.com/docs/products/catalog/get/) provides `productAttributes` and source value IDs/titles | Parent details expose attribute value lists; variant options/combinations supply SKU-specific choices |
| Conditional choices | [Product search](https://dashboard.gelato.com/docs/products/product/search/) accepts `attributeFilters: {attributeUid: [valueUid]}`; `hits.attributeHits` describes filtered values | Variant pages and explicitly reported combinations; no Gelato-style attribute-filter contract is assumed |
| Exact identity | [Product detail](https://dashboard.gelato.com/docs/products/product/get/) by returned UID, checked against fresh definition/filtered search | Exact returned catalogue variant/SKU in the selected parent's requested variant page; exact combination required |
| Measurements/markets | Search measurements are kept when detail omits them; supported country codes are reported availability, not a stock guarantee | Source `dimensions` are physical measurements; display size labels are never converted into physical dimensions. Region labels are not country allowlists |
| Manufacturing cost | [Product prices](https://dashboard.gelato.com/docs/products/prices/) filtered by exact UID, destination/currency and single quantity | Existing address-based order quote; no assumed per-market unit-price endpoint |
| Delivery/tax | Existing [v4 order quote](https://dashboard.gelato.com/docs/orders/v4/quote/) contract, separate from unit manufacturing price | Existing `/quotes/order`, supplier currency retained; unreported tax remains unknown |
| Order creation | [v4 create](https://dashboard.gelato.com/docs/orders/v4/create/) requires exact UID, files/address and shipping method | Existing v5 order API requires exact SKU/configuration/assets. No new submission is enabled or invoked |
| Imagery | Manufacturing catalog schemas do not establish representative-photo fields/licences | Catalogue parent/variant schemas do not establish product-photo fields/licences; asset mockups are separate |

[Gelato Ecommerce product list](https://dashboard.gelato.com/docs/ecommerce/products/list/) is scoped to `/stores/{storeId}/products`; it is not the manufacturing catalog. Store previews and provider asset mockups are not assumed to be general supplier product photography. This implementation shows explicit category-image placeholders and labels JBU artwork mockups illustrative. It makes no supplier-image licence claim, does not invent a rendering API and does not scrape images. Add authorized image metadata only after verifying the account capability and usage permission.

These API shapes are documented; **credentialed account responses were not available in this environment**. Fixtures are explicitly labeled and contain observed UID strings plus synthetic contract responses. There is no claim of a successful live configuration, live artwork analysis or purchase acceptance in production.

## Service contract and compatibility

`providerNativeService(db, adapter)` exposes:

- `nativeDiscover({provider,offset})`: catalog/presentation metadata; no manufacturing inventory walk.
- `nativeDefinition({provider,catalogId})`: provider IDs, definitions, capabilities and cache freshness/version.
- `nativeConfigure({provider,catalogId,selection,country,offset})`: one source page of exact candidates, conditional options and an explicit options scope. Source pages have at most 25 manufacturing records; no recursive fetch loop is used. Targeted pagination is bounded to offset 1000; refine attributes when the limit is reached.
- `nativeResolve({provider,catalogId,selection,externalId,variantId,configuration,country,offset})`: fresh definition, source membership, exact raw attributes/combination, market check and immutable selection snapshot. No UID is concatenated from selector values.
- The existing `studioVariantCost`, `wallArtCosts` and `quoteCandidate` operations provide manufacturing costs and address-based quotes. Cost estimates never become approved retail prices automatically. They remain separate from JBU Price Books.

All routes use the existing bearer/separate-role admin check and Zod contracts. Private `nativeResolved` objects cannot be supplied through the public operation schemas; Add resolves them server-side. Prodigi options without reported combinations remain unresolved/unselectable; no Cartesian product is fabricated. Structured attributes control selection and saved attributes; legacy UID parsing is used only when resuming legacy configurations, never to define native presentations or native manufacturing identity.

The same interface can serve a future AI/CPQ consumer. Recommendations must still call exact resolution. Future five-presentation Template Base is a curated input to this engine, not a second engine; it is not implemented here.

## Lightweight persistent metadata cache

Migration `20261217_provider_native_metadata.sql` adds one private `provider_metadata_cache` table: provider/key, schema version, normalized definition/list JSON, fingerprint, fetched time and expiry. Keys are versioned (`v1:`) and expire after 24 hours. Only catalog lists and selected parent/catalog definitions are persisted. Search pages, manufacturing compatibility, prices, customer addresses and inventories are not stored in this cache.

A fresh metadata cache reduces definition requests; expiry triggers retrieval. On metadata failure, existing metadata may be displayed with a stale warning. It never certifies current availability. Exact resolution always refreshes the definition and source product/variant; a provider outage cannot authorize a new saved configuration using a stale definition. Cache read/write failure does not block live discovery. Provider failures expose existing error codes/Retry-After and explicit retry controls; there is no automatic page extraction or retry loop. Late aborted browser reads cannot overwrite the current selection.

## Artwork and production

The analysis stage uses selected production-asset pixel metadata, or matching artwork-image asset metadata when present. It reports unknown geometry when absent, never treating physical artwork dimensions as pixel counts. Available production derivatives remain selectable through existing facilities. Geometry estimates orientation, ratio, crop/border fractions and effective DPI for actual source dimensions. It does not change presentation/product identity. Recommendations are advisory: production still needs a validated derivative/print area/bleed under existing fulfillment approval.

## Public Fine Art Prints, pricing and checkout

Public options are **only published, market-eligible, explicitly priced JBU variants**. Shared pure configuration helpers drive both source combination checks and approved public attribute matching. Public React receives no provider key or supplier-private projection and implements no provider-specific API logic. This phase deliberately does not sell the unbounded native provider option space or unapproved live-margin rules.

The public presentation page reuses existing artwork/product associations and adds attribute controls over its approved variants. Cart identity remains the JBU variant UUID/market; unsupported combinations cannot introduce a new variant. Existing server checkout revalidates artwork, publication/image/production/mapping eligibility through the publication projection, destination/currency and current approved Price Book amount. It makes no mandatory live provider request; a provider outage does not break a previously approved/priced JBU configuration. Fulfillment approval must handle later supplier unavailability without silently changing a paid configuration or charged amount.

Private server projections now retain the provider mapping/configuration list already frozen in the verified commercial-image configuration. Checkout copies this into its immutable line snapshot along with the existing attributes, retail amount, price entry, artwork and variant IDs; it is excluded from public projections. The existing paid-order RPC and immutable triggers preserve the full line. This freezes approved supplier identities/configuration alternatives; it is not an automatic provider-routing/order decision. Existing mapping/production/idempotency/reconciliation controls and the `ENABLE_PRODUCT_PROVIDER_SUBMISSION` default remain unchanged. No real supplier or Stripe order is created by tests.

Selected native candidates pin raw variant/options, catalog/presentation, definitions/version, exact source identifiers, selected attributes/configuration and resolution time. Final save creates disabled mappings by default. Product Manager sees the same IDs/attributes/mappings as before. Existing provider canonical rows are reused with ignore-duplicate semantics for native selections, preserving earlier specifications; the candidate snapshot supplies the newly selected specification to the existing save RPC. No published product or price is rewritten.

## Staging acceptance and rollback

1. Keep PR #82 unmerged. Apply the additive metadata migration to isolated staging; no supplier-run migration/reset is required. Configure the existing Supabase URL/anon/service bindings and server-only `GELATO_API_KEY` / `PRODIGI_API_KEY`. Do not enable supplier submission.
2. Use an admin with the separate role. Select **Urban Totem N° 02 — Architectures of Memory** and an asset with known pixels where available. Verify analysis, choose Framed Posters, change size/frame choices, inspect real returned UID, invalid combinations, preview/fit and manufacturing cost. No active supplier revision or prior SKU download is needed.
3. Save selected drafts and read them back in Product Manager. Verify exact mapping, source snapshot, pending production review and draft price status. Only approve/publish explicitly reviewed images/configurations/markets/prices through existing procedures.
4. Test public presentation attributes, navigation/cart persistence/authentication, market/price changes, Checkout snapshot and existing original/legacy/limited-edition regressions in isolated test environments. No live payment is required to review this PR.
5. **Only after native workflow acceptance**, retire the old external supplier cron trigger. This PR does not mutate a live schedule, disable a running job, delete history or reset the Gelato checkpoint. Archive/retention is a separate reviewed decision. Normal Studio no longer exposes sync counters or requires that worker.
6. Roll back the application release if needed; keep the additive cache table and all existing product/mapping/history rows. Cached metadata can expire harmlessly. Restoring the old indexed Studio requires its earlier complete revision, so do not discard that history. Do not replay destructive down migrations or alter commercial prices to roll back this UI.

## Automated validation

Node contract tests cover empty/no-index discovery, fresh/expired/missing cache, source errors/429, invalid combinations/forged UID/market changes, changed supplier data, Gelato attributeFilters, Prodigi differences, geometry, approved-only public choices, migration privileges, selected-only SQL persistence and immutable Checkout provider configuration. The actual UnifiedStudio browser harness walks the seven stages with the named artwork fixture, changes valid sizes/frames, excludes an invalid pair, requests manufacturing cost and saves, in English desktop/light and Spanish mobile/dark. Its network handler uses the real native service against clearly labeled supplier fixtures and throws on any legacy sync/index operation.

Run `node --test lib/productCatalog/*.test.js`, scoped ESLint, `npx tsc --noEmit`, `npm run build`, and `tests/supplierCatalog.browser.cjs` with the documented Playwright/esbuild module environment variables. The dedicated supplier-catalog workflow repeats these checks without requiring real provider keys. Credentialed staging acceptance remains a deployment prerequisite, not something fixture results can establish.

### Acrylic configuration response diagnostics

The reported initial request (`nativeConfigure`, Gelato `acrylic`, empty selection,
MX, offset 0) is valid and is now covered explicitly. It first reads the catalog
attribute definition, then searches products. `invalid_provider_response` alone
does not identify which response failed, and does not prove a provider timeout.
Do not bypass attribute or exact UID validation to hide this error.

Gelato definition/search failures now include `providerOperation`
(`catalog_definition` or `catalog_search`). Structural validation also includes
`responseField`, a constant schema path such as `productAttributes[].values` or
`products[].productUid`, without copying source values, credentials or response
bodies. The Admin configurator displays these diagnostics and retains Retry.
Malformed attributes/products remain unselectable.

The live Admin diagnostic isolated the failure to
`catalog_definition / productAttributes[].values`: JBU required an enumerable
array for every attribute. Its exact non-array source value has not been captured.
When a definition has a missing/non-array values list, the adapter now issues one
unfiltered native catalog search with `limit: 1, offset: 0`. The documented
`hits.attributeHits` supplies catalog-wide option counts independently of the
product page size. Only exact source option IDs with positive integer counts are
exposed, with the ID as the fallback label. Existing enumerated attribute lists
and labels are preserved. All missing lists share this one bounded request;
there is no pagination or exhaustive SKU download.

Missing, malformed, empty or all-zero fallback facets still fail closed. Individual
product attributes never supply a substitute option universe. Metadata is cached
normally; saving forces a fresh definition/facet read and still validates the
filtered exact UID and fresh product attributes. Regression tests cover null,
absent and object-valued lists, invalid/zero facet counts, exact resolution, forged
selections, and the one-request bound. The browser harness exercises missing lists
through discovery, configuration, Retry and saving. These are fixture validations;
live acceptance still requires retrying Acrylic in the updated preview.
