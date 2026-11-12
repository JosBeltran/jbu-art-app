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
- [ ] Update each affected source-review row and hash, distinguish confirmed/rendered/unverified evidence, and retire findings for deleted code. Do not assign compliance percentages from imports or lexical flags.
- [ ] Identify remaining caveats and whether the PR is safe for merge; do not deploy automatically.

## PR evidence template

Affected routes: ...

Carbon APIs / tokens: ...

JBU exception (if any): ...

Desktop/mobile + light/dark evidence: ...

Keyboard/a11y evidence: ...

Tests run and results: ...

Known limitations and follow-up owner: ...

## Continuation audit evidence gate (2026-11-11)

- [x] Original 117 pending paths accounted for, including 2 retired chat wrappers; current 157 app/components JSX/TSX rows individually reviewed.
- [x] Additional JS route wrappers/providers/server JSX and all 58 stylesheets have individual notes; source census includes root entries.
- [x] Compare against pinned main `8c25490` and record retired/replaced findings; local integration has no textual conflicts.
- [x] Run scanner plus fixture regression, TypeScript, production build, lint, mixed-runner tests and existing HTML CI checks; outcomes and failures in audit report.
- [x] Run isolated Chromium matrix for public fixture routes, axe checks and scoped keyboard probes; record actual URLs after auth redirects.
- [ ] Authenticated collector/admin browser states, populated cart and successful/error checkout transaction states accepted with safe fixtures.
- [ ] Physical devices, screen readers, 200% zoom, full dynamic error/disabled states and all contrast pairs accepted.
- [ ] Correct the confirmed findings and rerun affected interaction/theme/width checks before claiming conformance.

The checked items describe audit work performed, not permission to merge. PR #42 remains draft/open; no production deployment or protected business-logic change is part of this continuation.

For each follow-up PR also check:

- [ ] Meaningful hidden labels; Checkbox callback signature; selected/expanded state; one interactive element per action; one main landmark.
- [ ] Generic inputs/actions use Carbon; every retained native specialty control has an explicit rationale and keyboard/selection evidence.
- [ ] Load fonts successfully and record resolved Carbon versions; do not equate family names with loaded font faces.
- [ ] Run both fresh-consent and saved-consent browser states; check overlays, bottom nav and long-content overflow at 672px and between breakpoints.
- [ ] Scope test runner correctly (`bun:test` vs `node:test`, VM flag where documented), record skips and fail counts, and keep lint failures visible even while diagnostic-only.

## Scoped promo merge-blocker gate

- [x] A single derived visibility condition owns the modal render and effects; hidden/detached dialog references do not intercept keyboard events.
- [x] Sign-in consumes the open request; sign-out and same-tab remount do not revive an already displayed promotion. Persistent eligibility/dismissal and API behavior are unchanged.
- [x] The committed Chromium harness tests wrapping, Escape/close, sign-in cleanup, restored overflow/focus, removed focus target, unmount, sign-out and mocked submission responses in both themes at375/1440px.
- [x] The same regression suite is run against `5c0ddb3` to establish before/after evidence; exact results are recorded in evidence/PROMO_LIFECYCLE.md.

This gate accepts only the corrected lifecycle. Unchecked global WCAG, screen-reader, authenticated visual and broader backlog items above remain open. Final merge recommendation depends on current-head CI as reported in the handoff.
