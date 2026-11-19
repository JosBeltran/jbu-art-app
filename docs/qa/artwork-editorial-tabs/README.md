# Artwork Detail editorial tabs

## Scope and composition

This builds on PR #78's responsive layout and keeps the unified Product Studio changes intact. The base branch is `fix/artwork-layout-print-stability` until that PR is merged. No schema, payment, provider, inventory, authorization, pricing, certificate or historical record changes are included.

- `ArtworkDetailClient.tsx` and `ArtworkDetail.module.css` reuse the existing purchase, history, community and claim components. The hero uses 9/16 and 7/16 proportions from 1024px within the existing maximum width; smaller screens use one column. Technique, dimensions and year come from existing localized values. Add to cart and Buy now retain their handlers and Carbon button kinds, sharing a row where space permits. Trust benefits use two columns when they fit; shipping labels still come from the existing shipping result.
- `ArtworkInformationTabs.jsx` uses installed Carbon line Tabs, TabList, TabPanels and TabPanel. Details are selected by default, with narrative and a Carbon Structured List in 8/8 columns. Provenance/versions and the existing QR Tile share 10/6 columns. Community uses 6/10 columns, with only the leaderboard in a Carbon Accordion. These inner grids adapt at 768px and stack below it.
- Community mounts on its first visit and remains mounted afterward, preserving errors, accordion expansion and component identities without repeating leaderboard reads on each tab change. Primary media loading and existing server-rendered detail/history content remain intact.
- `useHeroSticky.js` uses ResizeObserver and the measured public navigation/announcement offset. Sticky applies only on desktop when the whole panel fits the usable viewport, remains constrained by the hero, and falls back to normal flow for tall panels, mobile and short viewports. No fixed panel or nested scrolling is introduced.
- `MediaGallery.jsx` and its CSS add the artwork-only editorial layout variant with thumbnails beneath the main image. The image discussion action is a localized Ghost icon near the lower-right edge, outside the zoom button. It passes the active image's existing discussion context and exposes selected feedback with `aria-pressed`. Images retain `object-fit: contain`; fullscreen, navigation and mobile swiping remain available.
- `ArtworkQR.jsx` uses a Carbon Tile. Its CSS wraps QR/text at narrow widths. The QR destination and SVG serialization/download behavior are unchanged.
- Related artworks stay outside tabs, with two columns on mobile, three on tablet and four on desktop. A single card retains one column's width. Existing Carbon Pagination handles the remaining fetched cards after the initial four, with the original catalog link preserved.
- Ownership is a horizontal Carbon Tile at the bottom, stacking on mobile. Existing authenticated claim and anonymous sign-in destinations remain distinct.

## Links and interaction

Supported fragments include `#details`, `#specifications`, `#provenance`, `#authenticity`, `#artwork-versions`, `#artwork-provenance`, `#artwork-registration`, `#community` and `#community-momentum`. Recognized aliases select and scroll to the corresponding content. Unknown fragments retain the default details view.

Routine tab interactions replace the current history entry, preserving existing query parameters and Next.js history state. Hash navigation and browser Back/Forward select the appropriate tab. Carbon manages tab keyboard focus and ARIA relationships. Existing discussion URLs and purchase/claim routes remain unchanged.

## Verification

The browser suite uses real React, Carbon, application components and CSS with mocked IO boundaries and fixture artwork images. It covers all three panels at **375, 768, 1024, 1440 and 1920px**, in light/English and dark/Spanish (30 panel/viewport/theme combinations), plus:

- Keyboard tab activation, ARIA panel relationships, fragments, aliases, unknown fragments, Back/Forward and unchanged history length for routine tab selection.
- Selected-image versus artwork discussion, mobile icon feedback, gallery navigation and fullscreen.
- Lazy community mounting, preserved error/accordion state, stable DOM identity and no additional leaderboard reads on revisits.
- Contribution package display amounts and the existing checkout payload (500/1,200/2,500 points; 50/100/200 MXN).
- Related artwork counts of zero, one and six, fixed card proportions and pagination.
- Sticky panel bounds and fallback for short/mobile viewports.
- Anonymous cart/checkout sign-in, authenticated ownership link, country-based availability, currency label and Limited Edition guards.
- Existing Product Studio typing, caret, draft/save/reopen, delayed/error costs and Gelato/Prodigi continuity regressions.

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
  lib/artworkCommerce.test.js lib/artworkDiscussion.test.js
node --test lib/productCatalog/studioDiscovery.test.js \
  lib/productCatalog/commerce.test.js lib/productCatalog/commerceCheckout.test.js \
  lib/productCatalog/adapters.test.js
```

Browser tools used: esbuild 0.28.2, Playwright 1.62.1 and system Chromium. Build verification uses placeholder backend credentials and the existing `tests/nextFontResponses.cjs` local-font fixture. Placeholder public-data lookup warnings do not prevent the build.

Results: the full 14-case browser suite passed, followed by two passing focused checks for stricter country availability and contribution payloads (15 distinct regression cases total). Type checking and production build passed; 51 public-business and 18 catalog/commerce unit tests passed. Repository lint retains **118 errors / 92 warnings**, matching the preceding baseline. New tabs/sticky code, QR component and test files lint cleanly; the detail component and gallery retain their existing diagnostics.

## Review images

These screenshots use synthetic fixture artwork and shipping data, not production records:

- [Light / English: purchase hero and details](hero-details.png)
- [Dark / Spanish: provenance and QR](provenance-dark.png)
- [Light / English: community](community.png)

## Limits

No live Stripe charge, provider API call, authenticated comment submission, real certificate claim or database mutation was performed. Checkout and contribution request boundaries are verified with fixture transport; production credentialed flows still need staging acceptance. Currency conversion and country/edition/commerce logic are additionally covered by the existing unit tests. Fixture screenshots do not establish production web vitals.
