# JBU Design System — Carbon v11 Implementation Guide

**Status:** source-reviewed continuation, 2026-11-11; main `8c25490` plus PR #42 patches. This document is a binding implementation guide; it does **not** assert full WCAG or visual conformance.

## Source of truth and installed stack

IBM Carbon: https://carbondesignsystem.com/ (v11, React). The dependency ranges in `package.json` declare `@carbon/react ^1.116.0`, `@carbon/styles ^1.115.0`, `@carbon/icons-react ^11.88.0`, `next 16.3.4`, `react 19.2.8`, `tailwindcss ^4`. This audit’s non-mutating install resolved React Carbon **1.120.0** and styles **1.119.0**; these are Carbon v11 package families, not Carbon major v1. The lockfile/install mismatch means clean installations can differ; record resolved versions with evidence. Do not upgrade Carbon as part of this design audit.

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

Use Carbon's 2x grid and recognized spacing rhythm. Carbon v11 component heights are xs 24px, sm 32px, md 40px, lg 48px, xl 64px, 2xl 80px; prefer component `size` over CSS height overrides. Carbon breakpoint names: 320px (sm), 672px (md), 1056px (lg), 1312px (xlg), 1584px (max). Common application transitions: 672px and 1056px, as applied in the catalog; existing mobile thresholds 767px/47.99rem are a documented platform convention and not automatically an error. Avoid unreviewed extra breakpoints, uneven padding and detached absolutely positioned action elements. Use `min-width: 0` for grid/flex card children. Test 375, 672, 1056 and 1440 CSS pixels and device safe areas.

## Supported control patterns

Use `Button` for interactive actions; `TextInput`, `TextArea`, `Select`, `Dropdown`, `Checkbox`, `Toggle`, `Search` for data entry; `Modal` for dialogs; `InlineNotification` for feedback; `InlineLoading` or skeleton for loading; `Tag` for semantic metadata, and Carbon icons in standardized sizes. Keep labels, helper text, errors and focus visible.

Avoid `button` and `input` replacements styled via ad hoc Tailwind in routine admin forms. `PrintVariantsManager.tsx` was deleted on main; its replacement `app/admin/prints/PrintManager.jsx` already uses Carbon. Current routine-control migrations include `CreateSeriesModal`, `EnumSelect`, cart clear/remove, tracking inputs and promo email/actions. Preserve values, handlers, labels, disabled/error states and request contracts.

## Editorial and specialist exception candidates (conditional acceptance)

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

## Evidence and exception rules added in the continuation

- Use **source-confirmed**, **rendered fixture observation**, **hypothesis**, **retired**, or **unverified** for every finding. Inventory completeness is a review-work count, never a compliance percentage.
- Routine native controls should use Carbon when there is a suitable primitive. Native anchors, semantic headings, `details`, images, video playback, QR SVGs and artwork thumbnail buttons are not automatically violations. Carbon renders native HTML internally; tag counting cannot identify accessible or inaccessible implementations.
- A custom gallery still needs appropriate selection semantics and dialog focus management. Avoid declaring `role="tab"` unless implementing the associated focus/keyboard/panel pattern; use ordinary pressed buttons when that is the correct interaction.
- Use `Button as={Link}` (or documented `href` support), not an anchor around a Button. Keep one interactive element per action.
- Hidden labels must remain meaningful: `labelText="" hideLabel` does not create an accessible name. Carbon Checkbox’s installed signature is `(event, { checked, id })`; binding a single argument to Boolean is incorrect.
- Fixed white QR substrates and print styles, fixed dark photographic stages, Google identity branding, device illustrations, and social-image/canvas exports are justified exception candidates. Document scope and contrast/focus evidence. An exception for artwork output never exempts the editor’s form controls.
- Link distinction must work without color alone. Check foreground contrast against both backgrounds and neighboring text; Carbon imports do not protect against local CSS or missing link styling.
- Text on changing purple must use `--jbu-on-color`, not unconditional white. The current promo CTA pair is #fff/#be95ff in dark (2.35:1); the intended dark text pair #161616/#be95ff is 7.70:1. Do not treat arithmetic on explicit pairs as a full-page contrast audit.
- Font family strings and font download configuration are separate from successful font loading. Check `document.fonts`, actual WOFF requests and computed styles for body, controls, Mono metadata and Serif headings. Generic `--cds-code-font-family` fallbacks need validation.
- Keep one main landmark per document, with labelled sections/navigation inside it. Review portalled Carbon overlays and inherited themes separately from the page root.

Official Carbon references were retrieved on 2026-11-11: [modal accessibility](https://carbondesignsystem.com/components/modal/accessibility/), [themes](https://carbondesignsystem.com/guidelines/themes/overview/), [typography](https://carbondesignsystem.com/elements/typography/overview/). These describe managed modal focus/keyboard behavior, theme token roles and productive/expressive Plex type sets. The app’s expressive art presentation can remain while routine forms follow productive controls.
