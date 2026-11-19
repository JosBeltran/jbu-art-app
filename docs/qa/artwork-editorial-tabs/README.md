# Artwork Detail — approved composition and final refinements

## Final page order

Collection/current-artwork breadcrumb → static 9/7 gallery/purchase hero → always-visible About and Technical Specifications → related artworks with ownership claim → exactly two final tabs, Provenance & Authenticity and Community Momentum. No independent content section follows the tabs. Mobile stacks these same sections without adding navigation patterns.

The hero keeps horizontal thumbnails and the selected-image comment icon. Its purchase hierarchy is collection/availability, title, technical summary, divider, artwork type, price/currency, cart/Buy now, compact Share/Explore Fine Art Prints actions, then conditional trust benefits. Favorites, view counters and artwork-level comments remain absent. The purchase panel never becomes sticky/fixed.

## Four refinements

1. **Share:** reuses `ArtworkShare` as its existing labeled Ghost button and Share icon. The original social context is passed through, preserving canonical artwork URL, localized metadata, native sharing and copy/channel fallbacks. No new sharing service or analytics source is introduced.
2. **Prints:** uses the existing `artworkPrintHref` artwork-specific route, retaining destination filtering. The server reuses `loadFineArtVariants` for published products, verified public imagery, active prices and eligible destinations, and the existing anonymous `getPublicPrintArtworks` projection for legacy publication/lineage eligibility. Only eligible countries are passed to the artwork client; provider/configuration data is not added to its payload. Disabled, inactive, unavailable, sold-out, unpriced or unpublished prints do not create the action. The legacy price fallback is retained only where the existing route supports it. The reads occur on the server, not when switching tabs.
3. **Versions:** the provenance timeline stays on the left. Compact version rows replace the QR Tile on the right, using only the existing `public_artwork_versions` family already loaded on the server. Rows retain projected relationship order, thumbnail, localized title, optional year and supported predecessor/current-version information. The current artwork and duplicates are excluded; explicit draft/unpublished successor records are rejected. There is no recursive client traversal or inference from products/collections. Without eligible versions, no card/message/placeholder renders and the timeline spans the full width. The public RPC remains the visibility authority; existing database regression tests cover its RLS and version-publication behavior. The current RPC does not include a year field, so no year is invented or fetched separately when it is absent.
4. **Dividers:** the three major section boundaries use one 1px `--cds-border-subtle-01` border each. Existing total section spacing is split between margin/padding, retaining alignment and avoiding extra boxes or decorative elements.

The QR component, certificate data, QR services/download implementation, verification routes and ownership registration remain in the repository and are unchanged by these refinements. The Hero certificate trust benefit remains. Existing conditional auction, pending-payment, offer, inquiry and local-delivery controls remain in the commerce area.

## Modified implementation

- `ArtworkDetailClient.tsx`: Share/Prints actions, destination availability, versions alongside provenance, QR presentation removal.
- `ArtworkDetailPage.jsx`: server-only public print availability using the existing storefront/publication loaders and a narrow country projection.
- `ArtworkDetail.module.css`: compact actions/version rows, conditional full-width provenance and Carbon dividers.
- `lib/artworkDetailPresentation.js`: small presentation helpers for deduplication and existing print/price eligibility. No database model is introduced.
- Focused unit/browser fixtures and assertions, plus the captures below.

No schema, product/provider creation, inventory/reservation, checkout, currency conversion, certificate/claim, authentication or historical-record changes. Existing Product Studio and provider workflows remain intact.

## Validation

Browser suite: **18 regression cases passed**, including both tabs at 375/768/1024/1440/1920px in light/English and dark/Spanish. Assertions cover the approved section order, final two tabs, normal-flow purchase panel, visible descriptions/specifications, mobile thumbnails, compact related cards, ownership and the removed controls. Additional checks cover:

- Canonical native/copy sharing and artwork-specific print links, including absence for ineligible destinations/no products.
- Public/unique versions, no self/draft/unpublished successor rows, compact images, links and full-width timeline when empty.
- Three Carbon 1px dividers; no QR download/panel on this page.
- Gallery, zoom, image discussions, cart/checkout sign-in, country availability, authenticated claim and Limited Edition guards.
- Keyboard/ARIA relationships, direct fragments and Back/Forward, community state and unchanged contribution payloads.
- Existing Studio typing/caret/draft/save/reopen/cost/error/Gelato/Prodigi continuity.

All **78 unit/database checks passed**: 69 existing public-business/catalog/commerce tests, three focused presentation tests and six version/publication/RLS database regressions. Type checking passed. New helpers, tests and server wiring lint cleanly. Repository-wide lint retains **112 errors / 91 warnings** in existing code (previously 114 / 91). Production Webpack build results are recorded in the PR.

```sh
JBU_BROWSER_TOOLS=/path/to/browser-tools \
JBU_CHROMIUM_PATH=/usr/bin/chromium \
JBU_STABILITY_EVIDENCE=work/results.json \
node --test tests/artworkPrintStability.browser.mjs
node --test lib/artworkDetailPresentation.test.js lib/artworkVersions.database.test.js
npx tsc --noEmit
npm run lint
npm run build
```

Build uses placeholder backend credentials and the existing local-font fixture; expected public-data lookup warnings do not block compilation. Existing repository lint diagnostics are reported separately from clean new helpers/test/server-wiring files.

## Captures and limits

The application uses its existing artwork data and media. Captures use synthetic fixture artwork/shipping/print-availability data:

- [Final composition, light / English](hero-details.png)
- [Provenance and versions, dark / Spanish](provenance-dark.png)
- [Community as the final tab, light / English](community.png)

Browser tests use actual React/Carbon components and application CSS with mocked IO. No live Stripe charge, provider API call, authenticated comment submission, certificate claim or production database mutation was performed. Those credentialed flows still require staging acceptance. The fixture does not establish production web vitals.

## Production HTML workflow

The complete `Promotional Social OG tests and build` workflow was reproduced against its isolated Supabase fixture: 17 workflow unit/database tests, type checking, production build, and all five production-server scripts passed (`verifyFacebookHtml`, `verifyHistoricalPrintHtml`, `verifyPrintProduction`, `verifyArtworkComments`, `verifyPrintSharing`).

The historical-print HTML assertion now matches the approved artwork hero: the sold original stays visible, prints are a secondary link before the always-visible specifications, and print purchasing remains on the existing print page. It still checks unavailable countries/no-product cases, selected variant galleries, original purchase suppression and print/cart snapshots. No workflow step or test is skipped.
