# JBU Carbon UI Change Checklist

Use for **every** PR that adds or modifies public, collector, or admin interfaces. Carbon v11 is the default; JBU purple is a tokenized adaptation, not a replacement system. Link evidence in PR description.

## Planning and architecture

- [ ] Identify affected routes and reused UI components; update the source inventory when adding a route or UI file.
- [ ] Check official [Carbon documentation](https://carbondesignsystem.com/) against the installed `@carbon/react` version.
- [ ] Prefer Carbon primitives for input, navigation, feedback, modals, toggles and actions; compose business logic around them.
- [ ] If a custom gallery, art carousel, video control or specialized card is required, document why (E) and its accessibility plan.
- [ ] No new theme provider, component library or major Carbon version upgrade.
- [ ] Preserve Stripe, Supabase, orders, certificates, pricing, shipping, locales and route contracts.

## Tokens and layout

- [ ] Colors use Carbon semantic or the approved centralized `--jbu-*` tokens; add new brand color only with explicit approval.
- [ ] Both g10 (light) and g100 (dark) themes are reviewed; no hardcoded surface/text color inside normal UI.
- [ ] Light theme is used on first visit unless user explicitly chose dark.
- [ ] Hero and all nested surfaces respond to theme; contrast checked over artwork photos and gradients.
- [ ] IBM Plex typography and productive/expressive type tokens used consistently.
- [ ] 2x grid spacing, section rhythm, form/button heights and responsive breakpoints checked.
- [ ] CSS modules do not override private `.cds--*` internals without a documented reason.
- [ ] No new unnecessary `!important`, duplicate selectors or obsolete `.bx--` selectors.
- [ ] Tailwind is only a supporting layout utility, not a competing component/theme system.

## Components and behavior

- [ ] Use correct Carbon component anatomy, semantics and documented props.
- [ ] Labels, helper text, inline errors, validation and loading feedback are present and accessible.
- [ ] Dialogs trap/restore focus and close via Escape; disclosure and tooltips are keyboard-operable.
- [ ] Cards preserve the established artwork URL, original price and interaction; print variants are not new catalog cards.
- [ ] Icons use Carbon icons, appropriate sizes, ARIA names for icon-only actions.
- [ ] Reduced-motion respects user preference for animated artwork surfaces.

## Visual and accessibility verification

- [ ] Review mobile 375px and 672px, desktop 1056px and 1440px (and safe-area insets).
- [ ] Test keyboard-only navigation, visible focus, no keyboard traps or hidden hover-only controls.
- [ ] Check accessible name/role/value, reading order and relevant screen-reader announcements.
- [ ] Verify contrast against both themes (4.5:1 text, 3:1 large text and UI graphical elements).
- [ ] Check no horizontal overflow, 200% zoom and usable touch targets.
- [ ] Save before/after screenshots of changed areas in light/dark when browser access is available; otherwise say **not tested**.

## Automated and functional checks

- [ ] Run feature tests, ESLint, TypeScript and Next production build; record actual outcomes rather than assuming success.
- [ ] Preserve auth and client/server behavior, including browser back/forward, mobile menus and translations.
- [ ] Perform smoke tests for relevant cart, print, gallery, order and admin flows.
- [ ] Add regression tests for changes to shared tokens/controls.
- [ ] Re-classify affected A/B/C/D/E inventory rows based on evidence; do not count unsampled components as compliant.
- [ ] Identify remaining caveats and whether the PR is safe for merge; do not deploy automatically.

## PR evidence template

Affected routes: ...

Carbon APIs / tokens: ...

JBU exception (if any): ...

Desktop/mobile + light/dark evidence: ...

Keyboard/a11y evidence: ...

Tests run and results: ...

Known limitations and follow-up owner: ...
