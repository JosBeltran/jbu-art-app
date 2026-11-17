# PR #42 — Carbon overlay remediation, phase 2

This continues `audit/carbon-design-system-20261107` and preserves its existing
commits, source audit and WelcomePromo visibility/keyboard/scroll corrections.
Main `a72014f94e91a97c0c2b12f045bb3fdd6eac4969` was integrated with a clean merge;
no audit branch was replaced and no production action was performed.

## Defects and root causes

| Surface | Confirmed defect / cause | Correction |
|---|---|---|
| Market country selector | The actual “Tu país de compra” dialog is `MarketSelector`, rendered inside Navbar's fixed z-50 wrapper/Header stacking context. An otherwise opaque Carbon surface can be occluded by foreground content outside that context. Its default initial focus targets the disabled Save action when no country is chosen. | Body portal with an explicit Carbon g10/g100 Theme, initial combobox focus, launcher restoration, managed background inertness and Escape. No arbitrary z-index increase or global modal CSS override. |
| Checkout shipping destination | `ShippingProvider` sits outside the shell's Carbon Theme. It has no launcher/initial-focus contract and relies on Carbon's global body class alone. | Lift the existing AppThemeProvider so the provider's portal can read the current preference; apply the same themed overlay lifecycle and select focus. Existing destination promise/persistence/retry contract is retained. |
| CartDrawer | Custom aside/backdrop had no dialog semantics, initial/trapped/return focus, Escape or body scroll lifecycle. Tall content can push the footer outside a short viewport. | Retain its layout and commerce handlers; add dialog/title semantics, managed focus, inert background, scrollable 100dvh panel, backdrop cleanup and reduced-motion handling. |
| CreateSeriesModal | Native violet div/form lacked Carbon surface/theme and programmatically associated labels and modal keyboard lifecycle. | Carbon Modal, labeled TextInput/TextArea and notification. Exact insertion handler retained. The implicit submit control is disabled during loading just like the primary action, preventing repeated Enter submissions. |
| ArtworkLightbox | aria-modal claimed a modal interaction without focus management; global arrow handlers could act on unrelated focused content; thumbnail selection lacked a programmatic state. | Shared lifecycle, fixed g100 specialist media surface, selected/pressed thumbnail state, arrows scoped to gallery focus and excluded from editable/video controls. Swipe, image selection and zoom remain intact. |
| ArtworkVideoReveal | No initial/trapped/return focus; delayed completion could fire after unmount. Reduced-motion completion could run twice under React StrictMode. | Shared focus/scroll lifecycle, clear the completion timer on unmount and guard reduced-motion completion once. State-driven completion scheduling also survives StrictMode effect replay when the source is missing. Cinematic composition, skip, reduced motion and media fallback remain. |
| Mobile catalog filters | No retained launcher reference; Escape previously left focus on body. | Retain/refocus the mobile launcher and focus the first filter input inside the shared Carbon overlay. |
| Nested PaymentDelivery | The real nested payment-method dialog also needed an explicit modal lifecycle to keep child Escape/focus separate from the cart. | Presentation-only portal wrapper and initial selected-radio focus. All payment, quote, scheduling, eligibility and submission handlers remain unchanged. |
| WelcomePromo CTA | White text on dark-theme lavender was 2.35:1. | Use the existing `--jbu-on-color` brand variable. Normal/hover foreground-background contrast is checked against 4.5:1 in both themes. The lifecycle component itself is unchanged from e380f8e. |

**Evidence limit for the reported transparency:** the basic unmodified fixture
computed an opaque modal surface, not a transparent one. The paired country
screenshots intentionally include a controlled foreground artwork layer (z-60)
outside the header's z-50 context to reproduce *occlusion*. They are component
fixtures, not production screenshots, and do not prove that this was the only
cause of the original production report. Preview verification of that report is
still required. The fix removes confirmed stacking and theme-scope defects
instead of masking them with opacity or higher stacking numbers.

## Implementation and files

`ThemedOverlay` portals outside header/transform contexts and reapplies the
existing Carbon Theme. Its lifecycle preserves prior overflow/inert values,
locks scrolling until the last managed overlay closes, focuses a usable target,
restores connected launchers and releases effects on unmount. Carbon retains
its focus trap; specialist cart/media dialogs use a focused trap with the same
lifecycle. Expanded comboboxes consume their first Escape. A child overlay owns
keyboard handling while it is open; closing it restores the parent's lock/focus.
Media overlays use Carbon's existing modal stacking level with source order,
rather than escalating their former 9999/10000 values.

Application changes:

- `app/ClientLayout.jsx`, `app/catalog/CatalogClient.tsx`.
- `components/overlays/ThemedOverlay.jsx`.
- `components/market/MarketSelector.jsx`, `components/shipping/ShippingProvider.jsx`.
- `components/CartDrawer.jsx` and `CartDrawer.module.css`.
- `components/CreateSeriesModal.jsx`.
- `components/ArtworkLightbox.jsx` and `ArtworkLightbox.module.css`.
- `components/media/ArtworkVideoReveal.jsx` and its CSS module.
- `components/delivery/PaymentDelivery.jsx` (presentation only).
- `components/promo/WelcomePromo.module.css` (on-color only).

Regression/evidence changes:

- `tests/carbonOverlays.browser.mjs`, `tests/fixtures/carbonOverlays.jsx`.
- `tests/welcomePromoLifecycle.browser.mjs` extends the existing 40 lifecycle
  cases with four normal/hover CTA contrast cases; no prior cases were removed.
- `.github/workflows/carbon-design-system.yml` retains prior gates and adds the
  blocking overlay suite plus screenshot/JSON artifact upload.
- Existing audit/inventory notes and the phase-2 JSON/log/screenshot evidence.

[Preservation checks](phase2-preservation.json) verify that the earlier promo
lifecycle source, cart checkout handler, series insert handler and shipping
fetch contract are unchanged. No `app/api`, `lib`, `supabase` or `context` code
changed relative to integrated main. No Stripe/Supabase records were accessed
or modified during these fixtures.

## Before/after screenshots

These are real components, Carbon CSS and compiled app CSS, with local IBM Plex,
mocked data/auth/router boundaries and a deterministic artwork fixture.

| Surface | Before | After |
|---|---|---|
| Country, 375 light — controlled stacking stress | [before](country-before-375-light.png) | [after](country-after-375-light.png) |
| Country, 375 dark — controlled stacking stress | [before](country-before-375-dark.png) | [after](country-after-375-dark.png) |
| Country, 1440 light — controlled stacking stress | [before](country-before-1440-light.png) | [after](country-after-1440-light.png) |
| Country, 1440 dark — controlled stacking stress | [before](country-before-1440-dark.png) | [after](country-after-1440-dark.png) |
| Checkout destination, 375 light | [before](shipping-before-375-light.png) | [after](shipping-after-375-light.png) |
| Cart, 375 light | [before](cart-before-375-light.png) | [after](cart-after-375-light.png) |
| Series form, 375 light | [before](series-before-375-light.png) | [after](series-after-375-light.png) |
| Lightbox, 375 light | [before](lightbox-before-375-light.png) | [after](lightbox-after-375-light.png) |
| Reveal waiting screen, 375 light | [before](reveal-before-375-light.png) | [after](reveal-after-375-light.png) |
| Mobile filters, 375 light | [before](catalog-before-375-light.png) | [after](catalog-after-375-light.png) |

[Scrollable series modal in the 200% reflow approximation](series-reflow-after.png).
Additional dark-theme screenshots are retained beside these pairs. The reveal
fixture checks the waiting/skip lifecycle; it does not claim video playback
acceptance. The same fixture includes representative high-stacking foreground
content so the header containment problem remains reproducible.

## Validation

| Check | Observed result |
|---|---|
| Overlay/browser acceptance | **90 pass / 0 fail** in the full matrix; [results](phase2-after.json), [log](phase2-browser.txt). Final media-only follow-up: **14 pass / 0 fail**, including a new missing-source StrictMode case; [results](phase2-reveal-final.json), [log](phase2-reveal-final.txt). The committed CI suite now has 91 cases. |
| Same fixture contracts against pre-remediation main | **16 expected failures** in the selected baseline; [results](phase2-before.json). These are fixture contract cases, not a count of WCAG violations. |
| Existing promo lifecycle + CTA contrast | **44 pass / 0 fail** (original 40 retained plus 4 contrast checks); [results](phase2-promo.json), [log](phase2-promo.txt). |
| Wider Node suite, VM flag, two workers | **436 pass / 0 fail / 5 existing skips**; [summary](phase2-node-summary.txt). Includes all Node lib tests and `tests/*.test.mjs`, including 6 Carbon source/scanner tests. |
| Bun-only lib suite | **167 pass / 0 fail**; [summary](phase2-bun-summary.txt). Current main already includes the earlier preview mock repairs; this continuation did not repair commerce tests. |
| Production Webpack build and TypeScript | **Pass**, with placeholder configuration and the existing bundled IBM Plex font-response fixture; [log](phase2-build.txt). |
| Changed-source lint versus integrated main | **0 new normalized diagnostics**. Current files retain 5 errors / 12 warnings; baseline has 5 errors / 15 warnings. New helper/tests are clean. Full repository lint is not declared clean; [comparison/preservation](phase2-preservation.json). |
| Whitespace and preserved handlers | Pass; earlier promo lifecycle and cart/shipping/series business handlers are unchanged. |

The overlay matrix covers **375, 672, 768, 1056 and 1440 CSS pixels in both
light/dark themes**. It checks opaque computed surfaces, foreground hit testing,
initial/bidirectional/return focus, Escape, background inertness, scroll cleanup,
unmount, nested actual payment/shipping dialogs, selected gallery controls,
series payload/pending state and EN/ES dialog labels. Additional short-height
and reflow checks keep the footer reachable and modal content scrolling.
Screenshots were also inspected directly; acceptance is limited to these
isolated component fixtures, not all application routes.

Reproduce without production credentials:

```sh
npm install --prefix /tmp/jbu-browser-tools --no-package-lock --no-save \
  --no-audit --no-fund esbuild@0.28.2 playwright@1.62.1
node /tmp/jbu-browser-tools/node_modules/playwright/cli.js install --with-deps chromium
JBU_BROWSER_TOOLS=/tmp/jbu-browser-tools node tests/carbonOverlays.browser.mjs
JBU_BROWSER_TOOLS=/tmp/jbu-browser-tools node tests/welcomePromoLifecycle.browser.mjs
node --test tests/carbonDesignSystem*.test.mjs
```

With a preinstalled browser, set `JBU_CHROMIUM_PATH` (local execution used
`/usr/bin/chromium`). `JBU_OVERLAY_EVIDENCE` writes results/screenshots.
`JBU_OVERLAY_SOURCE_REF=a72014f94e91a97c0c2b12f045bb3fdd6eac4969` loads the
original components/styles for the intentional failing baseline; the baseline
run selected the 16 country/basic overlay cases and does not count as an
acceptance failure. Main and the audit head have the same pre-remediation source
for those phase-2 components. `JBU_PROMO_EVIDENCE` writes the preserved lifecycle
suite's results. Build validation uses the repository's existing local IBM Plex
font-response fixture and placeholder environment values.

## Remaining accessibility issues and merge readiness

- Draft PR #42 is not merged or deployed. New-head GitHub checks and preview
  verification must be reviewed after publication; old-head CI is not evidence
  for this continuation.
- Production screenshot parity, actual assistive-technology announcements,
  Safari/Firefox, physical touch devices and real mobile soft keyboards remain
  unverified. The 375×480 check is a short-viewport approximation, not a physical
  keyboard test. The 720-CSS-pixel/1440-device-pixel check approximates 200% reflow;
  it is not a browser-menu zoom or screen-magnifier certification.
- Desktop filter-modal checks open the normally hidden mobile dialog
  programmatically. They do not claim a desktop mobile-filter launcher exists.
- Existing repository lint debt is explicitly compared, not declared clean.
- Other DS-17 labels, DS-27 image fallbacks, DS-28 QR/tier contrast, DS-31 footer
  overflow and the remaining audit backlog remain open. No whole-app WCAG score
  or live commerce/authentication acceptance is inferred from these fixtures.

Recommended next remediation phase: remaining admin field names/associations,
then public image/QR/tier contrast and footer reflow, each with a focused browser
regression and authenticated/assistive-technology verification where needed.
