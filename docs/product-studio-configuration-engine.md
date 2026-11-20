# Product Studio grouping and configuration retrieval

## Status and evidence boundary

This is a focused correction to the existing unified Product Studio on top of main `4886bdf`. No Template Base/archetype UI or parallel configurator is introduced.

**Live acceptance remains pending.** This workspace has no Gelato/Prodigi/Supabase credentials or connected admin browser. Access to staging was requested. The supplier documentation endpoints also returned HTTP 403 in this environment. No live Gelato catalogue response, manufacturing confirmation, or real Urban Totem draft was obtained. The tests below use explicitly synthetic supplier responses and isolated database/browser fixtures; they do not establish that the reported production catalogue now meets acceptance.

## Confirmed implementation defects

- `gelatoSeries` required a simple numeric dimension token before doing any grouping. Explicit provider format selectors such as `pf_A3` and compound metric/imperial dimension tokens therefore retained sizes in product identity. Known orientation/size/frame/paper/finish selectors could remain separate cards rather than configurations.
- Gelato configuration inspection returned early. Step 2 reused the currently discovered SKU subset and its generic cross-category discovery cursor, rather than independently retrieving the chosen group's options. An initial card could expose one size while later source pages remained unread.
- Group normalization kept only the first variant in a supplier record, and merge deduplication used variant ID alone instead of the exact configuration key.
- Provider pagination inferred completion only from page length. Explicit totals on short pages and empty non-advancing pages needed handling. Configuration completeness was not represented independently as loading/partial/complete/failed.

These are reproducible code defects; without a real catalogue response they cannot be asserted to be the sole cause of the reported Gelato Framed Posters behavior. Actual single-size products, unreported supplier combinations, source pagination, and grouping defects must remain distinct.

## Identity and normalized contracts

| Level | Meaning |
|---|---|
| Category | `wall_art`, the existing scope |
| Product group | Provider + existing wall-art family + conservative provider-specific manufacturing identity |
| Attributes | Exact reported/recognized size, orientation, frame, paper, finish, glazing, mount, stretcher thickness and other applicable values |
| Supplier variant | Unchanged external product ID, variant ID/SKU and exact provider configuration |

Gelato grouping removes known explicit UID selectors and recognized dimension/orientation tokens inside recognized wall-art families. ISO-style format selectors are accepted without imposing a universal list of supplier sizes. Unknown manufacturing tokens remain in identity, preventing speculative merging by similar titles. Opaque/unrecognized UID structures remain separate until supported supplier evidence establishes a safe rule.

Every reported variant is retained. `widthMm`/`heightMm` preserve supplied dimensions, converting known cm/inch units to mm; recognized UID measurements are a fallback. A supplied format code may become uppercase `sizeCode`; no physical dimensions are invented from a code. Original provider IDs/SKUs are never changed.

Prodigi retains its catalogue-parent product identity. Only exact reported combinations are expanded. Attribute option lists without explicit valid combinations are marked unresolved and are not turned into a Cartesian product or selectable manufactured configurations. This is a supplier-data limitation, not evidence of a complete configuration set.

## Bounded retrieval and states

The existing `studioVariants` read operation gains optional catalogue/cursor parameters; old calls remain compatible. Gelato inspection reuses the real adapter, the existing wall-art discovery scanner and its five-minute bounded cache. It prioritizes the selected catalogue, then scans the remaining eligible catalogue snapshot. Snapshot IDs travel with the cursor so later category ordering cannot move its page positions.

- One supplier search page per server read, with a maximum of four sequential bounded reads per UI gesture.
- Up to 24 catalogues and the existing 10,000 offset limit. Reaching a bound remains **partial**, never complete.
- Metadata requests are cached/coalesced. In-flight identical reads share their request. Supplier `Retry-After` establishes a process-local cooldown; failures do not become successful cached pages.
- A group is **complete** only when its provider scan ends without unresolved/truncated/error state. Another valid one-size product may genuinely contain one configuration at completion.
- Loading, partial and failed states are explicit in the existing configurator. Errors keep the previously loaded variants, cursor, input selections and saved configuration rows. Retry resumes the same scan.
- Refresh discards configuration-page snapshots, preserving selected configurations and edit drafts. Stale-response guards/cancellation remain in place.

Configuration dropdowns filter actual retrieved variants, resolving the chosen combination to an existing exact supplier identity. They cannot synthesize a missing size/color combination. Save still re-reads the selected supplier variant via the existing candidate path and validates the stored configuration in `saveWallArtDrafts`.

## Persistence and compatibility

Selected configurations retain their candidate IDs, exact mapping identities, attributes, countries/prices, gallery recipes and selection keys. The existing group-based save produces one commercial product with its multiple variants. The existing transaction and session idempotency are unchanged; previously saved/published products are not regenerated by reading a newly grouped catalogue.

A PGlite regression saves three Gelato size/frame UIDs as one `framed_print` product and reads back all three original identities and frame/size values. Mappings remain disabled, and retrying the save returns the same product ID. Existing Prodigi combination, publication, price, checkout and fulfillment tests remain intact. No supplier order submission is activated and no schema migration is added.

## Checks

- 34 product-catalog unit/database tests pass, covering normalization, unknown-token isolation, explicit/compound sizes, pagination, genuine one-size completeness, failure/cooldown, exact combinations, multi-variant persistence and existing commerce.
- 19 Chromium regressions pass, including the existing editor/artwork regressions and a new grouped Framed Posters test: partial loading → add exact selection → provider failure/retry → complete set → change size/frame → select three variants → save one product → read mappings in Product Manager.
- Engine-scoped ESLint and type checking pass. Production build passes with placeholder backend credentials and the existing local-font fixture. Root lint retains the unchanged baseline of 112 errors / 91 warnings in existing unrelated files.
- A focused GitHub workflow runs the product catalogue contracts, type checking and engine lint on future changes.

```sh
node --test lib/productCatalog/*.test.js
npx tsc --noEmit
JBU_BROWSER_TOOLS=/path/to/browser-tools JBU_CHROMIUM_PATH=/usr/bin/chromium \
  node --test tests/artworkPrintStability.browser.mjs
npm run build
```

## Required live acceptance — not completed

With staging credentials configured securely, use **Urban Totem N° 02 — Architectures of Memory**, Mexico, Gelato and Framed Posters. Capture actual supplier group/UID/configuration responses, verify several sizes and supported frame/material/finish changes, confirm exact IDs at each selection, save multiple configurations into one draft, and read back Product Manager mappings. Also check an actual single-size product, incomplete pagination and a provider failure. No publication or automatic supplier order submission is needed.

The future five Template Base archetypes can filter this normalized supplier configuration contract; this PR neither defines those templates nor invents configurations to fit them.
