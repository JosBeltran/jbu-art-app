# JBU Carbon v11 audit — continuation and final source report

**Source audit reviewed:** 2026-11-11; subsequent scoped promo lifecycle correction is recorded below. **Verdict:** individual source inventory complete; **Carbon/WCAG acceptance remains open**. There is no application-wide compliance score.

## Pinned comparison and scope

- PR #42 head: `683ca4398b5d2b16903121df445b92f757619abc`, branch `audit/carbon-design-system-20261107`, draft/open.
- Fork/base: `9b7f2c101b31a670a09079bacca66d7ae735c150`.
- Current main fetched: `8c25490aa2cdda119806ce248113435fafde2773` (59 commits reachable from main but not the PR; 67 changed app/components paths since fork).
- Local integration of PR head and main completed **without textual conflicts**. No GitHub merge or production deployment was performed. The completed continuation is prepared for the existing audit branch; remote publication status is reported separately in the final handoff. Textual mergeability does not establish visual compatibility.
- The four original documents, v1 scanner, five source-assertion tests and workflow were read. This continuation updates the four documents, scanner scope/provenance, scanner fixture regression and workflow triggers. That initial continuation introduced no additional application behavior changes. The later correction below changes only the welcome modal visibility/focus/scroll lifecycle; the social-preview token patch is unchanged.
- Stripe, Supabase, auth, country rules, orders, inventory, pricing, fulfillment and commerce/promotion request handlers are unchanged by this work. Main’s subsequent changes are the comparison baseline, not audit remediations.

## Coverage reconciled

Original 141 app/components JSX/TSX files = 24 previously inspected + 117 PENDING. Main retains 138, removes 3 and adds 19, yielding **157 current files**. All have individual source notes in [the inventory](JBU_COMPONENT_INVENTORY.md). Of the 117 original pending files, **115 are reviewed at current source and 2 retired chat wrappers were inspected at the original PR head**. The third deleted file, PrintVariantsManager, was already reviewed in the old 24.

All **58 current CSS files** have individual notes (original 56 plus PrintManager and Discussion). No CSS/SCSS file was inferred compliant from counts. The expanded inventory includes **14 JS route/layout wrappers**, `context/CartContext.jsx` and `lib/social/render.server.jsx`: **173 source entries**, plus **78 route/layout entry points** including root page/layout. Route wrappers, context providers and bitmap renderers are not 173 interactive components. Focused source review covers UI markup, relevant effects, Carbon APIs and styling, not a complete business-logic audit.

Evidence levels used here:

- **Source-confirmed:** an inspectable implementation property; runtime impact is limited to what follows directly from it.
- **Rendered fixture observation:** reproduced in isolated Chromium with repository mock data, not production acceptance.
- **Hypothesis / unverified:** needs additional state, device or assistive-technology evidence.
- **Retired:** no longer actionable on current main.

No A/B/C/D/E distribution, invented percentage or “fully compliant” classification is used.

## What is established

`app/layout.tsx:3–36` configures IBM Plex Sans/Serif/Mono, imports Carbon CSS before globals and initializes theme from the server cookie. `app/ClientLayout.jsx:33` wraps the app in Carbon `Theme` g10/g100; `AppThemeProvider.jsx:12–38` defaults to light and synchronizes localStorage/cookie/html class. In the rendered matrix, the shell resolved background/text to **#f4f4f4/#161616 in light** and **#161616/#f4f4f4 in dark**. This illustrates why root `:root` declarations cannot alone predict computed Carbon-theme values.

The installed non-lockfile-mutating resolution was **@carbon/react 1.120.0**, **@carbon/styles 1.119.0**, Next **16.3.4**, React **19.2.8**; the repository declares compatible ranges, not an exact Carbon runtime. Node here was **24.22.1**, while GitHub workflows specify Node 22. Browser font-face inspection confirmed loaded IBM Plex Sans 300/400 and Mono faces for exercised content. Unused font subsets/weights being unloaded is normal. The coarse `document.fonts.check('16px "IBM Plex Sans"')` field in the initial matrix returned false; use the later per-face evidence, not that probe as proof of missing Plex. Serif and all control/metadata type roles are not comprehensively accepted.

Public catalog uses Carbon Search/Dropdown/Checkbox/ContentSwitcher, mobile Modal and Tag/Button; Fine Art Prints uses Carbon Search/Select/Tag/Button. New PrintManager, print production/assets, artwork discussions and moderation predominantly compose Carbon controls. Artwork detail, collector Tabs/ProgressBar/ClickableTile, and payment/delivery Modal/radio/address forms have a real Carbon foundation. Imports alone do not prove accessibility, responsive or theme compliance.

## Findings carried forward and corrected against main

| Original ID | Current disposition |
|---|---|
| DS-01 root tokens / bx selectors | Still present: manually bridged legacy CDS variables, brand tokens and four lexical bx selectors in globals. Computed g10/g100 shell now sampled; do not remove overrides blindly. |
| DS-02 landing themes | Custom light/dark palettes remain; later `.page .hero` overrides win over earlier raw dark hero rules. Inspect HeroCarousel’s separate CSS too. Editorial customization is justified, contrast over all images remains unverified. |
| DS-03 native PrintVariantsManager | **Retired. Deleted on main.** Replacement `app/admin/prints/PrintManager.jsx` uses Carbon; old migration task would waste work/reintroduce obsolete UI. |
| DS-04 welcome modal | Original patch introduced a session-change keyboard lock; the paired scroll-lock issue already existed on main. Both are corrected under DS-34 below and tested with the actual component in Chromium. Custom form/dialog and contrast debt DS-26 remain separate follow-ups. |
| DS-05 landing navigation | Still custom, with aria-expanded/controls already present on mobile menu. Do not claim those attributes are absent. Migrate routine actions conservatively; preserve editorial navigation. |
| DS-06 / DS-07 admin series / provenance | Dense inline layouts remain maintenance debt. Series image selection has aria-pressed and can stay; provenance visibility Select has an actual empty-name finding. |
| DS-08 cart / profile | Cart clear/remove native actions remain; drawer now uses Carbon close/remove Buttons. Profile preferences are Carbon Selects. A rounded border is not an accessibility failure. |
| DS-09 artwork detail | Main adds version, print sharing/discussion and destination contexts. Thumbnail aria-pressed already exists; do not replace image selectors solely because native. |
| DS-10 social preview | Original PR semantic surface/foreground patch retained and five source assertions pass. No claim that this certifies the whole editor. |
| DS-11 nav / admin shell | Main adds prints/comments/production navigation and responsive behavior. Focus/overlay and 768–1055px transitions need authenticated checks. |
| DS-12 specialist media | Keep exception candidates; source review now confirms specific focus/tab-pattern gaps, DS-16/19. |
| DS-13 catalog / sharing | Carbon controls retained; main adds destination/filter handling, dedicated print pages and sharing. Prior assumption that prints must never be separate cards is stale for `/prints`; preserve dedicated variant URLs and current catalog contracts. |
| DS-14 persistence | Saved light/dark cookies/localStorage matrix rendered; fresh default sampled. Cookie-vs-storage disagreement, restricted storage and hydration transitions remain unverified. |

## Actionable findings, ranked

Priority describes remediation order, not a computed compliance score. Source anchors refer to the integrated source snapshot. Automated axe results below require human review before asserting every instance is a WCAG failure.

| ID / priority | Evidence | Finding and bounded remediation |
|---|---|---|
| **DS-16 / P1** overlays | **Source + cart keyboard fixture.** `components/CartDrawer.jsx:82–188`, `ArtworkLightbox.jsx:29–66`, `media/ArtworkVideoReveal.jsx:33–58`. | Cart custom aside/backdrop has no dialog focus lifecycle/Escape handling; opening left focus on the header cart trigger and Escape left the aside open. Lightbox/reveal claim aria-modal but provide no initial/trapped/return focus; lightbox does handle Escape/arrows. Use a reviewed Carbon Modal or a tested specialist dialog pattern. Keep media composition and commerce handlers. |
| **DS-17 / P1** admin names/dialog | **Source.** `CreateSeriesModal.jsx:70–150`, `ui/EnumSelect.tsx:56–73`, artwork edit `page.tsx:513`, `admin/ProvenanceManager.jsx:112`. | CreateSeries uses plain div dialog, no managed focus/Escape, sibling labels without for/id, fixed violet native fields and a glyph close button. EnumSelect’s sibling label is also unassociated; edit Series and provenance visibility pass empty labelText despite nearby text. Use Carbon Modal/inputs with meaningful labels and unchanged values/handlers. |
| **DS-26 / P1** promo contrast | **Source + explicit WCAG pair arithmetic.** `WelcomePromo.module.css:99–111`, `globals.css:45–51`. | `.cta` white text on dark `--jbu-purple:#be95ff` is **2.35:1**, below 4.5:1 for this small text (also below 3:1). Light white/#6929c4 is 7.74:1; intended dark #161616/#be95ff is 7.70:1. Use on-color token; verify focus/disabled/hover and rendered promotion fixture. Live promotional submission was not exercised; isolated mocked response handling is now covered by the lifecycle regression. |
| **DS-27 / P1** missing images | **Rendered fixture + source.** `components/ArtworkImage.jsx:57–62`. | Broken/missing image returns fixed stone text/background and drops caller className/style. Catalog/prints fallback reads **2.47:1** (#a6a09b/#fafaf9), and remains a light block in dark. Use semantic fallback roles and retain appropriate container sizing without changing image/source resolution. Deliberately broken image in repository stub made this reproducible. |
| **DS-28 / P1** detail contrast/QR | **Rendered fixture + source.** `TierProgressBar.module.css:41–44`; `ArtworkQR.jsx:39+`. | Light tier multiplier axe measurement **3.04:1** at 18px normal text (#24a148/#f4f4f4); 4.5:1 required. QR SVG has role=img but no accessible name in fixture. Use a suitable text role and meaningful SVG title/label; retain white QR substrate and encoded URL. |
| **DS-31 / P1** home overflow | **Rendered fixture + measured element bounds.** `Landing.module.css` footer/footerLinks rules. | At **672px**, light and dark document width was **893px**. Footer nav spans x=196 to 892.89 with trailing privacy/cookie/preferences actions off-screen; the 671px mobile rule does not apply. Make footer links wrap/shrink at this transition; verify long EN/ES at 672/768/1056 and zoom. No broad home redesign. |
| **DS-23 / P1** Carbon API binding | **Source + installed API.** `app/admin/facebook/page.jsx:88,92,96`; installed Checkbox `onChange(evt,{checked,id})`. | Three Checkbox callbacks coerce the first event argument to boolean, rather than reading checked. Turning off can leave true; confirmation can stick. Separate tiny API-contract PR with controlled interaction test. Publishing endpoints/data are outside this audit; no Facebook action executed. |
| **DS-19 / P2** custom tabs/motion | **Source.** `AuctionEventClient.jsx:229–232`, `MediaGallery.jsx:123–133`, `HeroCarousel.jsx:242–252`. | Role=tab markup lacks associated tabpanel/roving focus pattern. Carousel has Arrow keys and hover/focus/reduced-motion pause, so do not claim keyboard controls absent; persistent pause/resume remains missing. Use Carbon Tabs/ContentSwitcher for routine auction view; retain gallery controls with correct button/selection semantics. Verify motion and tabs with keyboard/screen reader. |
| **DS-18 / P2** routine native controls | **Source.** Cart `page.jsx:114,169`; tracking `page.jsx:31–32`; EnumSelect; PointBoostWidget; CurrencyToggle/LanguageToggle; login recovery actions; VerifyCertificate integrity action; promo fields/actions. | Suitable Carbon Button/TextInput/Select/Checkbox patterns exist. Replace in small surface-specific PRs while preserving event contracts, data and focus. The artwork editor native print-image checkbox is routine; image-thumbnail selectors are a different, justified case. |
| **DS-20 / P2** nested interactive elements | **Source.** Admin auction/event lists and editors, `SeriesHomeList.jsx:90`, `CertificateActions.jsx:40–44`, auction closing bid CTA. | Link wraps Carbon Button. Use Button as Link or documented href so each action is one focusable element. Preserve URLs/targets and button labels. |
| **DS-15 / P2** landmarks | **Source + rendered fixture.** `ClientLayout.jsx:44` and catalog/prints/success/collector route main elements. | Shell main nests route main on several screens. Catalog, prints and success each exposed two main elements in sampled DOM. Agree one owner and use sections for route internals; verify authenticated hierarchy separately. This is not part of the axe WCAG-tag violation list. |
| **DS-29 / P2** link distinction | **Rendered fixture; source local link rules.** AuthShell footer, promo privacy/legal and cookie policy links depending on theme/viewport. | axe found links within text without underline or sufficient 3:1 distinction from surrounding text. Login signup link measured 1.01:1 relative to surrounding text. Add persistent non-color distinction; validate both background and neighboring-text contrast. See exact selectors in browser evidence; some cookie instances vary by viewport/theme. |
| **DS-30 / P2** checkout cancellation | **Source + rendered fixture.** `app/checkout/cancel/page.jsx:14–52`. | Fixed violet/light-text page bypasses g10/g100; paragraph measured **3.86:1** (#a684ff/#4d179a) at 16px. Tokenize confirmation surface/copy and use Carbon navigation actions without touching payment/order lookup or cancellation behavior. |
| **DS-24 / P2** ownership selection | **Source.** `CertificateOwnershipPanel.jsx:200`. | Collector result buttons encode selection only through CSS class; use Carbon choice pattern or programmatic selected/pressed state with labels. Test keyboard and return focus without issuing/reassigning certificates. |
| **DS-25 / P2** promotion upload | **Source.** `PromotionStudio.jsx:369`. | Clickable label wraps hidden file input with no focusable keyboard proxy. Use Carbon file uploader or accessible Button/input association; preserve accepted files/render presets and CLIXMEDIA timing. |
| **DS-32 / P2** small breadcrumb targets | **Rendered axe candidate, manual adjudication pending.** Artwork fixture at 375px: three breadcrumb links. | Targets ~18px high and axe reports insufficient spacing. Check WCAG 2.5.8 inline-text exceptions and actual pointer usability before assigning formal failure. Increase target padding only if compatible with breadcrumb layout. |
| **DS-33 / P2** catalog modal return focus | **Rendered keyboard fixture.** Mobile CatalogClient filter Modal. | Opening focused the primary View button; Escape closed the Modal after transition but focus landed on body instead of the Filters trigger. Supply/verify the appropriate launcher focus reference with the installed Carbon API; test repeated open/close and filter changes. Carbon import alone did not establish return focus. |
| **DS-21 / P3** legacy/brand support | **Source.** UserNavbarDropdown; `.dark` selectors in AuthForm/ComoFunciona; code-font variable fallbacks. | Fixed dark native user menu has incomplete expanded-state semantics; confirm active usage before prioritizing. Google provider button is a brand exception candidate, not ordinary violet form debt. Align theme selector only after checking focus against its white background; do not blindly turn outline white. Verify Mono/Serif usage and prune only proven-unused selectors. |
| **DS-22 / P3** responsive hypotheses | **Unverified source risks.** Claims minmax280, Orders minmax300, release modal min280, cookie1055 vs bottom-nav767 breakpoints, panel overflow:hidden, cart reduced-motion omission. | Test authenticated forms, content-dependent overflow, overlay stacking, 200% zoom and reduced-motion. These CSS patterns are confirmed but actual failures are not established by the public matrix. Avoid reporting all fixed minima/!important as violations. |

## Styling, spacing and editorial decisions

All stylesheets have individual notes, including both structural and relevant typography/token rules. Most layout gaps/padding follow familiar .25/.5/.75/1/1.5/2rem rhythm, but many values are raw CSS rather than named Carbon spacing/type tokens. Dense inline admin layouts and extensive internal `.cds--`/!important overrides create maintenance risk; that is not automatically a WCAG failure. Correct component semantics, focus, actual contrast and clipping before extracting low-impact spacing constants.

Keep art photography, expressive headings, series/print cards, thumbnails, QR substrates, dark photographic/video stages, Google identity branding, editorial device illustrations and fixed-dimension social/canvas exports where they serve the artwork. Expressive typography is consistent with Carbon’s editorial guidance; it does not justify bespoke routine input/error/focus behavior. Carbon React should not be inserted into server-generated OG bitmaps. The conditional exception register and requirements are in [the implementation guide](JBU_DESIGN_SYSTEM.md).

## Scanner, tests and workflow assessment

The original scanner correctly called itself a **risk inventory**, not a conformance checker. It is lexical: comments/strings count, indirect Carbon wrappers are missed, native semantic controls may be legitimate, fixed colors may be fallback/QR/artwork, inline styles may be required exports, and CSS specificity/rendering/contrast/focus are not analyzed. Native tags, imports, color totals and !important counts must never become a compliance denominator.

Confirmed v1 gaps: only app/components roots; JSX/TSX-only UI list omitted JS route wrappers; route regex omitted root page/layout; no source hashes/versioned schema; scanner had no regression test (the five tests checked application strings). Narrow workflow paths skipped most catalog/prints/collector/admin changes.

Continuation improvements:

1. Scanner v2 adds root entries, JS/TS entry wrappers, context/lib JSX, SHA-256 per source/style and explicit scope/schema. It preserves lexical limitations and deterministic output. It does not silently turn findings into a pass/fail policy.
2. Real temp-directory fixture regression runs the scanner, tests root/JS/context/server JSX coverage, API/hidden/node_modules exclusion, deterministic counts/output, and content-hash invalidation. No production access required.
3. Workflow paths now cover app/components/context, JSX/TSX lib sources and package manifests; workflow_dispatch added. It still uploads the report and runs source tests, diagnostic lint, typecheck and build. Lint is intentionally still non-blocking to expose existing debt without disguising it as success. There is no rendered a11y gate yet.
4. Existing installation strategy deliberately does not change the stale lockfile; CI is not fully reproducible until a separate lockfile/dependency reconciliation. No dependency upgrade was committed here.

## Actual verification and limits

See [verification evidence](evidence/VERIFICATION.md) and raw [browser observations](evidence/browser-observations.json), [keyboard/font probes](evidence/keyboard-observations.json), and [source inventory](evidence/source-inventory.json).

- Original PR head GitHub CI: Carbon [run 42370531757](https://github.com/JosBeltran/jbu-art-app/actions/runs/42370531757) and Promotional Social [run 42370531702](https://github.com/JosBeltran/jbu-art-app/actions/runs/42370531702) completed successfully. These predate current main integration and do not validate the continuation.
- Local production Webpack build and TypeScript passed with dummy keys and isolated Supabase stub. Lint fails: **126 errors + 101 warnings**. Source/scanner tests **6/6 pass**. Full mixed-runner outcomes are recorded in verification; do not call CI universally green.
- Chromium/Playwright ran **80 route/theme/width observations**: `/`, `/catalog`, `/prints`, `/artwork/ver-history-fixture`, `/cart`, `/checkout/cancel`, `/checkout/success`, `/login`, `/collection`, `/admin/prints` × light/dark × 375/672/1056/1440, height900. Eight public destinations rendered, but collector/admin attempts redirected to sign-in (**16 redirects**). Those are not authenticated screen checks.
- **32 full-page screenshots and axe scans** cover eight public destinations at 375/1440 in both themes. Screenshots were captured; representative prints light/dark images were visually inspected. Other screenshots remain artifacts, not a human visual sign-off of every frame. No uncaught page errors in the matrix. Only home672 overflow reproduced; “no document overflow” elsewhere applies only to exercised fixture states.
- Fresh consent notice remained visible because the matrix’s seeded minimal consent object was invalid under the app’s versioned consent parser. Treat these as **fresh-consent** renders. The scoped keyboard probe dismissed via “Necessary only” using the actual UI; saved-consent states were not covered by the matrix. No optional analytics was accepted.
- Shell colors and loaded Plex faces were sampled; not every component/portal/hover/disabled state. Initial keyboard observations taken immediately after Escape were superseded by delayed probes to accommodate Carbon transitions; use final keyboard evidence.
- Automated results do not cover screen-reader announcements, physical devices/touch, Safari/Firefox, 200% zoom, all images/contrast pairs, fully populated cart, live Stripe Checkout, real collectors/admins, successful payments/reservations/authentication, live Vercel Preview or production. No accounts, comments, orders, settings, files or certificates were changed through the app.

## Small remediation PR plan

| Order | Proposed PR | Scope / acceptance evidence |
|---|---|---|
| 1 | Modal and drawer keyboard lifecycle | DS-16; cart first, then one specialist overlay per PR. Test initial focus, Tab/Shift+Tab containment, Escape, return focus, scroll lock and nested delivery modal in both themes. Preserve state handlers. |
| 2 | Admin label and series-dialog repair | DS-17; Carbon Modal/TextInput/TextArea/Select and meaningful hidden labels. Assert same form values/payload, invalid/disabled states and keyboard flow with isolated fixtures. |
| 3 | Public contrast and fallback repair | DS-26/27/28, scoped token and SVG-name fixes only. Capture both themes, missing-image fallback, tier text and promo hover/disabled/focus. Keep image/QR URLs and promo logic. |
| 4 | Home footer breakpoint repair | DS-31; wrap/shrink footer links. Screenshot375/672/768/1056/1440 EN/ES, no horizontal overflow and keyboard reachability at 200% zoom. |
| 5 | Carbon Checkbox API correction | DS-23; three binding changes with mocked interaction/payload tests. No real publishing or configuration edits. |
| 6 | Catalog/detail semantics and navigation | DS-15/19/20/24/33, split by route/control. One main owner, simple pressed thumbnail controls or full tabs, Button as Link, selection state. Verify URLs, keyboard and screen-reader names. |
| 7 | Checkout-cancel and small routine controls | DS-18/29/30; cancel tokens first, then cart/tracking actions in separate PRs. Preserve checkout/auth/country/order contracts; measure contrast and link distinction. |
| 8 | Authenticated responsive/visual acceptance | Safe populated collector/admin fixtures; triage DS-22 and breadcrumb DS-32, delivery modal states, dense tables and overlay stacking. Then token/spacing/legacy cleanup and CI browser gate. |
| 9 | Test infrastructure reconciliation | Repair existing collection preview mock promise contract, split Bun/Node commands, document five skipped DB cases, reconcile lockfile in its own reviewed PR, and decide an incremental blocking-lint baseline. |

**Merge scope:** this PR is an evidence-based source audit plus two controlled application patches and the narrowly scoped lifecycle correction below. Existing design-system debt does not mean this PR claims full conformance. Recommend merging this scope once the lifecycle regression and current-head CI pass; do not merge automatically. CartDrawer focus lifecycle remains the first follow-up remediation PR and is not implemented here.

## DS-34 — Final merge-blocker correction after `5c0ddb3`

**Before:** when an open guest modal received a non-null `session`, its render guard returned null while its effect still depended only on `open`. The newly added window keydown handler remained registered, found no controls and prevented Tab globally. The existing body overflow lock also remained hidden on sign-in; that scroll-lock defect reproduces on main and predates the PR. An unchanged `open` flag could revive the dialog on subsequent sign-out. These are visibility-lifecycle issues, not promotion eligibility or authentication-contract changes.

**Correction:** one `isVisible = Boolean(open && promo && !session)` condition owns rendering, modal image loading and layout-effect setup/cleanup. Sign-in consumes the pending open state during a guarded render retry, preventing sign-out from reviving it. The existing displayed-in-tab marker also guards scroll registration/remounts. The layout effect restores the exact previous overflow and removes its keydown listener whenever visibility ends or the component unmounts. It restores focus only to a connected, visible, enabled, non-inert prior element when focus still belongs to the outgoing modal/body. Missing or detached dialog refs never intercept the page keyboard. The dialog has a programmatic fallback focus target.

**Unchanged:** promo GET/POST requests, request body, response mapping, discount text/logic, localized strings, dismissal key/14-day duration, qualifying artwork selection and all commerce/authentication contracts. Sign-in does not write a persistent dismissal; the existing sessionStorage displayed marker prevents redisplay in that tab. CartDrawer and the broader backlog are untouched.

The committed isolated browser runner bundles the actual component and stylesheet, mocks router/data boundaries, uses React StrictMode, and tests 375/1440px in both light/dark themes. It can load the old component with `JBU_PROMO_SOURCE_REF=5c0ddb3df940686d8a5ccf0401ec0d87e8dc6262`. Exact before/after results, baseline diagnostics and CI snapshots are in [PROMO_LIFECYCLE.md](evidence/PROMO_LIFECYCLE.md). This is targeted keyboard/visibility acceptance, not full WCAG, live promotion or authenticated visual acceptance.
