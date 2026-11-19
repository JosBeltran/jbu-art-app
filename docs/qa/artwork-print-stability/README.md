# Artwork editorial layout and Product Studio typing stability

## Diagnosis

The active Fine Art Prints route is the unified `app/admin/product-studio/UnifiedStudio.jsx`, shared by Gelato and Prodigi. The existing `FieldPair` was already module-level with stable keys. An isolated Chromium fixture did **not** reproduce input remounting, focus loss, scroll jumps, or provider fetches caused by typing on the baseline.

It did confirm expensive unrelated work: each editorial character updated the entire wizard, rebuilt the selected-product groups, and searched every loaded discovery group even though discovery was hidden. `studioMatches` normalizes every variant's searchable data, including for an empty query.

With 120 groups × 8 variants, typing the same 54-character description under React Strict Mode caused 108 parent renders and 12,960 hidden `studioMatches` calls on the baseline. After this change: zero additional wizard renders, zero hidden matching calls, unchanged request count (7), the same focused DOM node, and unchanged window scroll. Counts are fixture-specific, not production performance claims.

## Changes

- `ArtworkDetailClient.tsx` and its CSS organize the existing gallery/purchase hero, information/history, related/registration, community, and ownership sections. Columns begin at 1024px in the hero and 896px in editorial rows; community adapts at 768px. Content heights remain natural. Long titles wrap; artwork images retain `contain` sizing.
- `MediaGallery.module.css` accepts an optional height variable scoped to this artwork hero, preserving its default behavior elsewhere.
- Existing locale helpers choose available medium/description translations. Authored title fields and historical provenance records are not translated or rewritten.
- New `StudioEditorial.jsx` owns local title, description, margin, and country-price edits. A synchronous draft ref records edits without rendering the wizard. Navigation commits the snapshot before review/save. Stable fields and validation preserve component identity.
- `UnifiedStudio.jsx` memoizes grouping by selected configurations and searches the catalog only on discovery, bypassing normalization for an empty query. Existing selection, previews, mappings, draft payload, and provider capabilities remain intact.
- `useCatalog.js` adds independent cancellable read scopes and a current-response guard. Discovery, variant lookup, workspace loading, and costs use them. Configurator cost reads also abort on dependency changes/unmount. Save/create/publish mutations are not cancelled.

## Validation

Run browser tests with existing esbuild, Playwright and Chromium installations:

```sh
JBU_BROWSER_TOOLS=/path/to/browser-tools \
JBU_CHROMIUM_PATH=/usr/bin/chromium \
JBU_STABILITY_EVIDENCE=work/studio-after.json \
node --test tests/artworkPrintStability.browser.mjs
```

The fixture bundles actual React/Carbon components and application CSS, mocking router, authentication, persistence and provider transport boundaries. It checks typing/caret/identity, long content, validation and locale changes, step continuity, country prices/margin, failed/delayed costs, draft save/reopen/edit, independent/stale read guards, provider selection, responsive geometry, themes, gallery/discussion access, QR download, cart, checkout sign-in and Limited Edition guards.

- `npx tsc --noEmit`: passed.
- Production `npm run build`: passed with placeholder credentials and the existing local font fixture. Public data lookup warnings are expected with the placeholder backend.
- Catalog discovery, adapter, commerce and checkout unit tests: 18 passed.
- Chromium focused regressions: 7 passed, including eight responsive/theme/locale layouts.
- Repository-wide `npm run lint` remains blocked by existing diagnostics across unrelated application files. ESLint on the changed Studio components and new browser fixture: passed. The changed public detail component has the same 34 errors / 4 warnings as its baseline (existing explicit `any`, hook and image diagnostics).

## Limits

No schema, Stripe, provider adapter, pricing calculation, route, product relationship or authored historical data changes. No live payments, provider API calls, authenticated comment submission, certificate claim, or real database draft persistence were performed. Those require configured staging credentials/data; the tests exercise the existing UI and request/payload boundaries. Local fixtures do not establish production web vitals or replace staging acceptance checks.
