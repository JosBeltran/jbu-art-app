# Artwork Detail — approved wireframe

## Composition

The page follows this order on desktop and mobile:

1. Collection/current-artwork breadcrumb; no Gallery or Catalog levels.
2. Hero: 9/16 media gallery and 7/16 purchase panel from 1024px, stacking below it. The purchase panel remains in normal flow at every viewport height. Horizontal thumbnails follow the viewer on mobile and desktop. The localized image-comment icon stays inside the viewer with the selected-image context, separate from zoom/navigation.
3. Always-visible About the Artwork and Technical Specifications, with balanced columns from 768px and a Carbon Structured List. Description paragraph formatting, localized authored content and configured technique/dimensions/year/collection remain intact.
4. Related artworks and ownership Tile, side by side from 768px and stacked in that order on mobile. Related cards are compact and occupy standard grid columns even with one item; existing pagination/catalog navigation remains. The claim copy matches the approved ES/EN text, with the existing authenticated claim action or anonymous sign-in destination.
5. Exactly two final Carbon line tabs: Provenance & Authenticity (default) and Community Momentum. No independent page section follows them.

The purchase hierarchy is collection/availability, title, concise technical metadata, divider, artwork type, price/currency, cart/Buy now row and conditional two-column trust benefits. The page excludes view/favorite counts, favorite/share actions, artwork-level comment action and Explore Fine Art Prints. These actions are not relocated. Existing conditional auction, accepted-payment, offer, inquiry and local-delivery controls remain within the commerce area; the floating auction bar is removed.

The first tab retains the existing versions and chronologically ordered provenance records beside the existing QR in 10/6 proportions. The verification heading is localized; QR content/destination and SVG download behavior are unchanged. The second tab retains tier/progress/valuation and contribution options in 6/10 proportions, with the existing leaderboard below. Community mounts on first visit and stays mounted on later visits to preserve interaction state and avoid repeated leaderboard reads.

## Affected components

- `app/artwork/[sku]/ArtworkDetailClient.tsx`: section order, breadcrumb, visible description/specifications, related/claim grouping, approved purchase hierarchy and excluded page controls. Consent-gated view analytics remain; local favorites UI/query/handler are removed, while records and shared favorites/share/print/comment services remain untouched.
- `app/artwork/[sku]/ArtworkDetail.module.css`: static purchase panel, content-sized paired sections, responsive card widths and two-column trust benefits. The sticky hook is removed.
- `components/ArtworkInformationTabs.jsx`: exactly two Carbon tabs, with Carbon keyboard/ARIA behavior, stable content identities and hash/Back/Forward support. Routine selection replaces history while preserving query parameters and Next.js state. Provenance/authenticity/community aliases remain available. Description is normal visible content at `#details`.
- `components/ArtworkQR.jsx`: optional localized verification heading, reusing the existing QR implementation.
- `components/media/MediaGallery.module.css`: artwork-only editorial thumbnails remain horizontal and visible on mobile. Shared gallery zoom, video, swipe, navigation and image discussion handlers are preserved.
- `tests/artworkPrintStability.browser.mjs`: approved composition, exclusions, two-tab behavior and updated regression assertions.

No database schema, relationships, print creation/provider integrations, inventory/reservation, currency/country, payment, certificate, claim authorization or historical data changes.

## Verification

- **16 browser tests passed**, including both tabs at 375/768/1024/1440/1920px in light/English and dark/Spanish (20 panel/viewport/theme combinations).
- The approval test asserts collection-only breadcrumb, 9/7 hero, horizontal mobile thumbnails, always-visible description/specifications, related/claim before tabs, exactly two information tabs, no sections after tabs, excluded controls absent, and normal-flow purchase behavior.
- Other browser checks cover gallery/zoom/image discussion, direct links, keyboard/ARIA relationships, Back/Forward, community identity/state/read counts, unchanged contribution amounts and checkout payloads, zero/one/six related cards, pagination, country availability, cart/checkout sign-in, authenticated claim and Limited Edition guards. Existing Product Studio typing/caret/draft/save/reopen/Gelato/Prodigi regressions also pass.
- **69 unit tests passed** across currency, country/shipping, physical edition, artwork commerce/discussion and product catalog/commerce adapters.
- `npx tsc --noEmit`: passed.
- Production Webpack build: passed with placeholder backend credentials and the existing local font fixture. Public lookup warnings are expected with the placeholder backend.
- Relevant lint still reports pre-existing diagnostics: the detail component/gallery together have 30 errors and 6 warnings, reduced from 34 errors and 7 warnings before this revision. New tabs/QR and test code lint cleanly. Repository-wide lint remains blocked by 114 errors and 91 warnings in existing code (previously 118 errors and 92 warnings).

Commands:

```sh
JBU_BROWSER_TOOLS=/path/to/browser-tools \
JBU_CHROMIUM_PATH=/usr/bin/chromium \
JBU_STABILITY_EVIDENCE=work/results.json \
node --test tests/artworkPrintStability.browser.mjs
npx tsc --noEmit
npm run lint
npm run build
node --test lib/currency.test.js lib/countryAvailability.test.js \
  lib/shippingCountries.test.js lib/physicalEdition.test.js \
  lib/artworkCommerce.test.js lib/artworkDiscussion.test.js \
  lib/productCatalog/studioDiscovery.test.js lib/productCatalog/commerce.test.js \
  lib/productCatalog/commerceCheckout.test.js lib/productCatalog/adapters.test.js
```

## Review images and limits

The application continues to render its existing artwork data and media. Test screenshots use synthetic fixture artwork/shipping data and do not replace application content:

- [Approved composition, light / English](hero-details.png)
- [Approved composition, dark / Spanish](provenance-dark.png)
- [Community as the final tab, light / English](community.png)

Browser tests use actual React/Carbon components and application CSS with mocked IO boundaries. No live Stripe charge, provider API call, authenticated comment submission, real certificate claim or database mutation was performed. These credentialed flows still require staging acceptance. The fixture does not establish production web vitals.
