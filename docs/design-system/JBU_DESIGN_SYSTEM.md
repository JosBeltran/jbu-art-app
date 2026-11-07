# JBU Design System — Carbon v11 Implementation Guide

**Status:** source-based baseline, 2026-11-07. This document is a binding implementation guide; it does **not** assert full WCAG or visual conformance.

## Source of truth and installed stack

IBM Carbon: https://carbondesignsystem.com/ (v11, React). Current `package.json` declares `@carbon/react ^1.116.0`, `@carbon/styles ^1.115.0`, `@carbon/icons-react ^11.88.0`, `@carbon/colors ^11.58.0` via dependencies of the installed stack, `next 16.3.4`, `react 19.2.8`, `tailwindcss ^4`. Check installed lockfile/actual resolved versions separately before any component API update. Do not upgrade Carbon as part of this design audit.

- [Theme and token architecture](https://www.carbondesignsystem.com/building-blocks/foundations/themes/overview)
- [Typography and type sets](https://www.carbondesignsystem.com/building-blocks/foundations/typography/overview)
- [2x grid](https://www.carbondesignsystem.com/building-blocks/foundations/2x-grid/guidelines)
- [Accessible contrast](https://www.carbondesignsystem.com/building-blocks/foundations/accessibility/color)
- [React components](https://www.carbondesignsystem.com/developing/react-tutorial/overview/)

## Governing principles

1. Prefer current `@carbon/react` primitives for actionable UI (Button, TextInput, Search, Select, Dropdown, Checkbox, Toggle, Modal, Form, Tabs, InlineNotification, InlineLoading, Tile and navigation structures).
2. Business-specific React components can **compose** Carbon controls. They do not need to be Carbon exports themselves.
3. Keep art photography, immersive Hero layouts, image/video galleries, lightboxes and customized thumbnails where functionally necessary. Treat these as reviewed **exceptions**, not permission to invent buttons and forms.
4. Never change Stripe, Supabase, certificates, product eligibility, authentication or pricing to fix a stylistic finding.
5. When Carbon documents a component interaction pattern, preserve its keyboard, focus, disabled, form-error, loading and ARIA behavior; use the installed v11 API.

## Typography

Fonts load through `next/font/google` in `app/layout.tsx`: `IBM_Plex_Sans` (primary UI), `IBM_Plex_Serif` (editorial only), `IBM_Plex_Mono` (labels and metadata). Use Carbon type tokens or corresponding vetted type sets for controls, headings and body copy; productive sizes are preferred for dense admin, expressive set may support the art Hero. Do not introduce alternative font families or random sizes when tokens cover the role.

## Theme ownership and semantic colors

The app uses `<Theme theme={dark ? 'g100' : 'g10'}>` in `app/ClientLayout.jsx`, with the JBU preference bridge in `components/AppThemeProvider.jsx` and `app/layout.tsx` (server cookie `jbu-theme`, browser localStorage). Default is **light** unless an explicit preference exists.

The intentional JBU brand palette is centralized in `app/globals.css`:
- Light: `--jbu-purple: #6929c4`, `--jbu-purple-hover: #491d8b`, `--jbu-lavender: #f7f2ff`, `--jbu-accent: #8a3ffc`, `--jbu-accent-soft: #e8daff`, `--jbu-on-color: #ffffff`.
- Dark: `--jbu-purple: #be95ff`, `--jbu-purple-hover: #d4bbff`, `--jbu-lavender: #241f2b`, `--jbu-accent: #be95ff`, `--jbu-accent-soft: #3d2f50`, `--jbu-on-color: #161616`.
- Structural roles should reference `--cds-background`, `--cds-layer-01`, `--cds-text-primary`, `--cds-text-secondary`, `--cds-border-subtle`, `--cds-focus` or Carbon design tokens as appropriate.

**Known debt:** `app/globals.css` also manually sets legacy `--cds-text-01/02`, buttons and focus colors in `:root`, and `.jbu-dark` mirrors theme values. These may conflict with Carbon's generated semantic values or theme scoping; audit **computed styles** before changing. Do not introduce a second theme provider or override Carbon internals globally for decoration.

Brand decisions are token-level; scope local colors to approved JBU accents. Text on purple must retain contrast in both themes.

## Layout, rhythm, and responsive

Use Carbon's 2x grid and recognized spacing rhythm. Carbon v11 component heights are xs 24px, sm 32px, md 40px, lg 48px, xl 64px, 2xl 80px; prefer component `size` over CSS height overrides. Typical breakpoints: 672px (sm), 1056px (lg), as applied in the catalog; existing mobile thresholds 767px/47.99rem are a documented platform convention and not automatically an error. Avoid unreviewed extra breakpoints, uneven padding and detached absolutely positioned action elements. Use `min-width: 0` for grid/flex card children. Test 375, 672, 1056 and 1440 CSS pixels and device safe areas.

## Supported control patterns

Use `Button` for interactive actions; `TextInput`, `TextArea`, `Select`, `Dropdown`, `Checkbox`, `Toggle`, `Search` for data entry; `Modal` for dialogs; `InlineNotification` for feedback; `InlineLoading` or skeleton for loading; `Tag` for semantic metadata, and Carbon icons in standardized sizes. Keep labels, helper text, errors and focus visible.

Avoid `button` and `input` replacements styled via ad hoc Tailwind in routine admin forms. Existing `components/admin/PrintVariantsManager.tsx` and `components/promo/WelcomePromoModal.jsx` require controlled follow-up rather than wholesale replacement without behavioral tests.

## Approved specialist components (E candidates, not blanket exemptions)

- `components/home/HeroCarousel.jsx`: timed art carousel with keyboard/touch/reduced-motion controls.
- `components/media/MediaGallery.jsx`, `components/ArtworkLightbox.jsx`: galleries and zoom; keyboard/focus exit verification pending.
- `components/AnnouncementBanner.jsx`: configurable editorial copy (not a generic form control).
- `components/nav/PublicBottomNav.jsx` and `components/nav/MobileBottomNav.jsx`: mobile site-specific navigation; must retain accessible landmarks and touch targets.
- Art imagery and expressive headings in `app/landing`, `app/catalog`, and artwork detail. These exceptions do **not** extend to checkout inputs, toggles, profile forms or admin dialogs.

## Tailwind and CSS

Tailwind v4 is an auxiliary layout utility; it must not define a rival button/form/theme system. `app/globals.css` maps select Carbon/JBU tokens through `@theme inline`. Prefer CSS variables for colors and shared layout tokens, and avoid direct `#hex` in feature CSS when semantic tokens exist. Minimize `!important`, global `cds--` internal selectors, deprecated `bx--` v10 selectors and duplicated rules; deviations require a documented why and keyboard/visual regression check.

## Accessibility gate

Target **WCAG 2.2 AA**. Minimum contrast: 4.5:1 regular text, 3:1 large text, 3:1 UI component borders/indicators. Validate keyboard tab sequence, focus visibility, focus trapping/return in modals, escape handling, labelled buttons, live errors, touch targets, zoom at 200%, non-hover access to artwork metadata, and reduced motion. Carbon compliance is not established by component imports alone.

## Acceptance process

Every UI PR must (1) identify Carbon components/tokens used, (2) check both light/dark, (3) inspect phone/tablet/desktop, (4) verify keyboard and contrast, (5) run lint/type/build and feature tests, (6) note deliberate editorial exceptions. See `JBU_DESIGN_SYSTEM_CHECKLIST.md`. If no browser testing took place, record that fact and do not claim full compliance. Keep the inventory and audit current when replacing previously reviewed controls.
