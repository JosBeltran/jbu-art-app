# JBU Carbon Design System — Audit Findings and Controlled Remediation

**Review date:** 2026-11-07 · **Baseline:** GitHub `main` snapshot · **Status:** PARTIAL SOURCE AUDIT — not a visual-compliance certification.

## Executive summary

JBU is built on IBM Carbon v11 (`@carbon/react ^1.116.0`, `@carbon/styles ^1.115.0`, `@carbon/icons-react ^11.88.0`). The main shell uses Carbon `Theme` (`g10` / `g100`), IBM Plex and centralized JBU purple tokens. This confirms a Carbon-based foundation, **not** whole-app compliance. Several newer forms/promotion screens use native controls, dense inline styles or hardcoded colors. Editorial imagery and specialty galleries are legitimate exceptions if interaction and accessibility are verified.

The Git tree inventories **72 route/layout entry points, 141 JSX/TSX UI sources and 56 CSS/SCSS stylesheets** in `JBU_COMPONENT_INVENTORY.md`. **24 of 141** UI files were inspected individually in this first pass; **117 remain unclassified**. Full component/style/visual coverage is **not achieved**. No automated visual, responsive, screen-reader or contrast measurements are available yet.

### Source-reviewed triage (do not interpret as compliance scores for entire platform)

| Class | Reviewed | % of 24 reviewed | Interpretation |
|---|---:|---:|---|
| A — verified fully compliant | 0 | 0.0% | Not claimed without rendered/interaction evidence |
| B — Carbon with brand/custom composition | 8 | 33.3% | Provisional source findings |
| C — partially compliant | 8 | 33.3% | Requires cleanup/validation |
| D — noncompliant candidates | 3 | 12.5% | Native form/navigation replacement needs review |
| E — justified custom candidates | 5 | 20.8% | Needs accessibility validation |
| **Unreviewed** | **117** | — | Not assigned a letter or inferred score |

**Audit completeness:** 24 / 141 UI sources = **17.0%** individually reviewed, while 100% of paths are enumerated. These counts were calculated from the actual reviewed sample, not invented.

## Route and feature coverage

Route *inventory* spans public home/Hero; `/catalog`, `/prints`, `/series/[slug]`, `/artwork/[sku]`; cart/checkout/orders; sign-in and onboarding; information, certificates/verification, auctions, promotions; collector account/favorites/profile; and every discovered `/admin` sub-route (artworks, series, Hero, media, merchants, offers, orders, auctions, claims, certificates, artists and collectors). Details are itemized in the companion inventory. Route existence is not equivalent to a visual review.

## Findings and recommendations (source inspection)

| ID | Route / scope | Component / source | Classification | Concrete deviation | Carbon standard / action | Risk |
|---|---|---|---|---|---|---|
| DS-01 | Global | `app/globals.css`; `app/ClientLayout.jsx` | C | Root manually defines several `--cds-*` variables (including legacy `text-01/02`) while Carbon `Theme` also owns semantic tokens; old `.bx--header__*` selectors remain alongside `.cds--` | Map purple through reviewed brand semantic roles; verify computed tokens under g10/g100; remove confirmed unused v10 selectors only after screen checks | High |
| DS-02 | Home / Hero | `app/landing/Landing.module.css` and `LandingJBU.module.css` | E/C | `.page` declares bespoke `--landing-*` with light/dark hardcoded colors; later `.page .hero` correctly follows theme; legacy raw dark hero rule remains | Keep editorial exception but consolidate theme aliases, confirm hero and overlay contrast on light/dark, mobile/desktop | High |
| DS-03 | Admin print variants | `components/admin/PrintVariantsManager.tsx` | D | 12 native `input/select/button` instances, not direct Carbon React controls; image-choice buttons may have a justified use | Use Carbon `TextInput`/`Select`/`Button` for routine editing; preserve gallery selector, errors and price model | High (regression) |
| DS-04 | Promotional modal | `components/promo/WelcomePromoModal.jsx` | D (partly patched) | Native form/actions and custom dialog instead of Carbon Modal; source previously lacked focus trap and focus restoration | **Patched** Tab containment, initial/return focus and preserved Escape; still needs rendered keyboard/screen-reader tests and controlled Carbon input migration | High (a11y) |
| DS-05 | Home navigation | `app/landing/LandingClient.jsx` | D | Self-styled header and multiple native menu/theme/logout buttons separate from `Navbar.tsx` Carbon header pattern | Evaluate a shared Carbon navigation model or document justified promo navigation; check aria-expanded, focus order and mobile | Medium/High |
| DS-06 | Admin series | `app/admin/series/[id]/page.jsx` | C | Carbon inputs coexist with ~37 inline `style` props and a native artwork selection button | Extract shared spacing/typography into tokens/CSS module; preserve selection state and artwork imagery | Medium |
| DS-07 | Admin provenance | `components/admin/ProvenanceManager.jsx` | C | Carbon controls + ~19 inline styles for layout and cards | Normalize spacing/feedback rules in admin styles, do not alter event order/data | Medium |
| DS-08 | Cart and account | `app/cart/page.jsx`, `components/CartDrawer.jsx`, `app/(account)/profile/page.jsx` | C | Repeated inline spacing and native close controls; account section uses arbitrary rounded border | Consolidate structural style rules and keep Carbon Tile/Drawer semantics; preserve pricing, guest checkout and currency | Medium |
| DS-09 | Artwork detail | `app/artwork/[sku]/ArtworkDetailClient.tsx` | C | Carbon composition plus native print thumbnail controls and inline styles | Consider print variant thumbnails an E subcomponent if keyboard- and selection-accessible; avoid price/variant logic changes | Medium |
| DS-10 | Social preview | `components/admin/PromotionalSocialEditor.module.css` | B (patched) | Fallback `#eee` surface and `#8a3800` warning foreground bypass semantic theming | Use `--cds-layer-01` and semantic warning indicator with primary accessible foreground | Low — **patched in this branch** |
| DS-11 | Global navigation | `components/Navbar.tsx`, `app/admin/layout.jsx` | B/C | Public Carbon header integrated with JBU theme; admin layout retains custom backdrop and mobile navigation | Verify fixed header stacking, safe area, keyboard escape, focus, touch target and Carbon nav patterns | Medium |
| DS-12 | Editorial media | `components/home/HeroCarousel.jsx`, `components/media/MediaGallery.jsx`, `components/ArtworkLightbox.jsx`, `components/AnnouncementBanner.jsx` | E candidates | Bespoke carousel/play/zoom and promotional content justified by art presentation | Keep as exceptions **subject to** reduced motion, focus, semantics and 320–1440px checks | Medium |
| DS-13 | Catalog / sharing | `app/catalog/CatalogClient.tsx`, `components/admin/SocialSharingSettings.jsx`, `components/share/ArtworkShare.jsx` | B | React Carbon inputs, notifications and modal; branded card/preview layers | Test selected and disabled states, mobile filters, OG image crop, text overflow; do not duplicate print cards | Medium |
| DS-14 | Theme persistence | `components/AppThemeProvider.jsx`, `app/layout.tsx` | B (source only) | Light default via server cookie + local storage is implemented; hydration and system-theme behavior unmeasured | Test clean session, saved dark, refresh, client navigation, themed Hero; no second theme system | Medium |

### Styling assessment

- `app/globals.css` defines baseline Carbon/JBU tokens and bridges Tailwind; localized brand values are intentional. Avoid replacing all theme declarations without computed-style evidence.
- `app/landing/Landing.module.css` contains early fixed dark hero declarations **but later more specific theme-driven `.page .hero` rules**; do not misdiagnose the earlier value as rendered dark without comparing specificity.
- The catalog already has Carbon styling and mobile/desktop breakpoints; custom editorial card imagery is not, by itself, a D classification.
- Confirmed controlled corrections are the social OG preview token fix and a keyboard-focus patch to the welcome promotional dialog. Neither establishes full visual compliance. A broad CSS override removal without rendered regression evidence was **not** attempted.

## Corrections performed

1. `components/admin/PromotionalSocialEditor.module.css`: replaced hardcoded preview surface with `var(--cds-layer-01)`; warning now uses `--cds-text-primary` and a tokenized warning border instead of arbitrary warning text color.
2. `components/promo/WelcomePromoModal.jsx`: added keyboard Tab containment within the existing dialog, initial focus, and focus restoration on close, without touching promotion business logic.
3. Introduced the design system governance document and repeatable PR checklist.
4. Recorded the complete Git source tree inventory, identified detailed high-priority issues and marked all unsampled files PENDING.

No Stripe/Prodigi, business logic, schema, permission, certificate, image inventory, order fulfillment or localization rules were modified.

## Tests and evidence

**Confirmed:** repository tree and source references; Carbon dependency declaration; sample JSX/CSS inspection. `app/ClientLayout.jsx` sets `Theme` g10/g100; `components/AppThemeProvider.jsx` default is light; both reviewed in source. Theme and style tests introduced in a dedicated CI workflow, with results to be linked once run completes.

**Not yet tested:** live browser rendering/screenshots on 375/672/1056/1440; both themes; keyboard navigation, modals, dynamic form errors, physical touch devices, screen readers; WCAG contrast; true pixel diff; full route-by-route smoke/regression; actual Vercel Preview. **Do not claim complete acceptance based on this audit.**

## Open work / controlled remediation backlog

1. Expand manual classification from 24/141 to all UI sources and investigate all 56 stylesheets. Prioritize design-critical shared components and the 117 unclassified files.
2. Capture light/dark rendered screens for representative public, collector and admin routes. Verify computed Carbon theme values and Hero/background contrast before root-token changes.
3. Add axe/Lighthouse/WCAG 2.2 AA checks; keyboard test modal focus including the newly added trap, select/filter, custom bottom nav, image lightbox and promo.
4. Convert routine print admin native inputs and promo form controls to Carbon without modifying handlers/data contracts; add behavioral regression tests.
5. Remove only proven-unused legacy v10 `.bx--` selectors and duplicates after comparing desktop/mobile screenshots.
6. Complete cross-flow validation of catalog, print indicators, sold works, cart, checkout, profiles, certificates and localization before any production merge.

## Acceptance

**NOT COMPLETE** under the user's full acceptance criteria. The files provide an honest, reproducible baseline and conservative remediation, not an unsupported 100% Carbon certification. Follow up on missing evidence before asserting uniform Light/Dark and accessibility conformance.
