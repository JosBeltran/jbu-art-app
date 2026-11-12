# WelcomePromoModal merge-blocker regression and correction

This is a narrow follow-up to the final readiness review of PR #42 at `5c0ddb3df940686d8a5ccf0401ec0d87e8dc6262`. It does not rerun the full design-system audit or implement CartDrawer/other backlog items.

## Before / after

The original component hid its DOM on sign-in but retained an effect keyed only to `open`. At the old PR head, sign-in left one window keydown listener, body overflow `hidden`, and Tab defaultPrevented=true with no dialog. Main already had the sign-in scroll-lock defect; the PR introduced the global keyboard interception. Keeping `open=true` also allowed redisplay on sign-out.

The corrected component derives `isVisible` from open/promo/session and uses it for rendering, image loading and its layout effect. A guarded local-state render retry consumes `open` on sign-in before commit; it does not change the authentication contract. The existing per-tab displayed marker guards later scroll/remount. Hidden state/unmount restores the prior overflow and removes the listener. Return focus requires a connected, visible, enabled, non-inert element and does not steal focus from another active destination. A missing/detached ref returns before handling Tab/Escape. The visible dialog has a fallback programmatic focus target.

| Same committed regression suite | Old component loaded from `5c0ddb3` | Corrected working-tree component |
|---|---|---|
| 40 cases across light/dark and375/1440px |20 pass,20 fail (expected exit1)|40 pass,0 fail (exit0)|
| Sign-in keyboard |Tab is cancelled, listener retained|Normal Tab/Shift+Tab navigation; listener removed|
| Sign-in scroll |`hidden` remains|Exact prior value `auto` restored in fixture|
| Return focus |Not restored on sign-in|Restored to connected original; removed original safely skipped|
| Subsequent sign-out |Previously open modal revives|No redisplay, no new hidden image load|
| Detached dialog |Window handler cancels Tab|No keyboard interception|
| Normal wrapping/Escape/close, unmount and mocked response flows |These passing cases distinguish the targeted failure from unrelated paths|Pass|

Raw [before](promo-lifecycle-before.json) and [after](promo-lifecycle-after.json) results include each scenario/theme/width. Before failures include observed dialog presence, overflow, retained-listener count and Tab cancellation. The expected failing baseline is evidence, not a failing acceptance run.

The suite covers initial guest opening, bidirectional focus wrapping, Escape and close-button dismissal, sign-in, post-sign-in keyboard navigation, overflow/focus cleanup, removed return target, component/router unmount, session changes/sign-out, same-tab reload suppression and detached dialog protection. Promo submissions use the unchanged `{email}` body and test disabled pending state, INVALID_EMAIL/NOT_ELIGIBLE/REDEEMED/unavailable/network failures and CLAIMED success. Artwork loading is deferred to check safe late completion after invisibility. React StrictMode is enabled. No live authentication, promo registration, payment or data mutation is performed.

## Reproduce locally or in CI

Install tooling outside the application (versions used by the workflow):

```sh
npm install --prefix /tmp/jbu-promo-browser-tools --no-package-lock --no-save --no-audit --no-fund esbuild@0.28.2 playwright@1.62.1
node /tmp/jbu-promo-browser-tools/node_modules/playwright/cli.js install --with-deps chromium
JBU_BROWSER_TOOLS=/tmp/jbu-promo-browser-tools node tests/welcomePromoLifecycle.browser.mjs
JBU_BROWSER_TOOLS=/tmp/jbu-promo-browser-tools JBU_PROMO_SOURCE_REF=5c0ddb3df940686d8a5ccf0401ec0d87e8dc6262 node tests/welcomePromoLifecycle.browser.mjs
```

The last command intentionally fails against the old source. For a machine with a preinstalled browser/module, set `JBU_CHROMIUM_PATH` and optionally `JBU_PLAYWRIGHT_MODULE`; local validation used `/usr/bin/chromium` and the environment's Playwright1.62.1. `JBU_PROMO_EVIDENCE` writes the JSON report. The runner bundles actual component/CSS and imports actual React/Carbon icons, with only data/router/logo/i18n boundaries mocked, then serves a temporary localhost fixture. It installs nothing in production and removes its temporary bundle on completion.

The Carbon workflow now installs isolated pinned tooling, runs this blocking browser regression and uploads its JSON artifact. The existing six Carbon/source/scanner tests remain separate; a string assertion is not treated as proof of focus behavior.

## Validation and baseline

| Check | Result |
|---|---|
| Browser regression, corrected source |40 pass,0 fail|
| Same browser regression, old head |20 pass,20 expected failures|
| Carbon/source/scanner tests |6 pass,0 fail|
| Node regression suite (45 files in lib/tests, VM flag, excludes bun:test) |354 pass,0 fail,5 skips (359 tests)|
| TypeScript `tsc --noEmit` |exit0|
| Production Webpack build, dummy values/local Supabase stub |exit0|
| Changed-file ESLint |exit0; one pre-existing no-img-element warning in modal|
| Full ESLint versus main |126 errors,101 warnings on both;0 new normalized diagnostics|
| Bun versus main |Same161 passes/6 failures; no unrelated repair|
| Source inventory |173 entries/58 CSS/78 routes; only WelcomePromoModal hash changed|
| Git patch whitespace |Passed before publication|

See [baseline comparison](promo-baseline-comparison.json). The separate main checkout at `8c25490aa2cdda119806ce248113435fafde2773` used the same installed dependencies. Normalization removes checkout path/patch line shifts while preserving diagnostic messages/rules/severity/multiplicity. The6 Bun failures remain the collection-preview mock promise-chain defect, not a new change to collector code. The full lint step remains diagnostic/non-blocking in CI and must not be called clean because its enclosing job is green.

Local check logs are retained as promo-carbon.txt, promo-node.txt, promo-types.txt, promo-build.txt and promo-changed-lint.txt. Original all-app browser evidence retains its original snapshot and acceptance limitations; it is not relabeled as evidence for this fix.

## CI snapshots and acceptance

Before the correction, the old head `5c0ddb3` had successful Carbon [run43115151143](https://github.com/JosBeltran/jbu-art-app/actions/runs/43115151143), Promotional Social [run43115151067](https://github.com/JosBeltran/jbu-art-app/actions/runs/43115151067), Vercel Preview Comments and Vercel preview status. Carbon logs still showed lint exit1, as expected for the non-blocking existing debt. These old green checks did not catch the reproduced bug.

Correction-head CI is inspected after publication, with exact implementation SHA/run links appended in the CI snapshot below. Do not infer new-head success from old-head or local results.

This correction is scoped lifecycle acceptance. Screen readers, physical devices, all CSS/contrast states, real authenticated flows and live promotion redemption are not accepted by this fixture. Existing promo contrast DS-26 and other design-system findings remain follow-ups. Recommend merging PR #42 as the scoped audit/lifecycle fix once correction-head CI is green; do not merge or deploy automatically. The first post-merge remediation remains CartDrawer focus lifecycle, explicitly outside this correction.

### Verified implementation CI snapshot

Implementation commit: `75c06d9e348e94a9324abe6aca3e396154a3452b`.

- Carbon [run43127365424](https://github.com/JosBeltran/jbu-art-app/actions/runs/43127365424): **success**, including the new40-case browser regression, source tests, TypeScript and production build. Lifecycle JSON artifact: `jbu-promo-lifecycle`.
- Promotional Social [run43127365257](https://github.com/JosBeltran/jbu-art-app/actions/runs/43127365257): **success**, including its existing HTML integration checks.
- Vercel preview status: **success**. This is a feature-branch preview; no production deployment or merge was requested/performed.
- Repository lint still logs the known126 errors/101 warnings and non-blocking exit1; the enclosing workflow success is not a clean-lint claim.

This snapshot is recorded by a documentation-only follow-up commit. Its application/test/workflow source is identical to the verified implementation commit; final head checks are reported separately in the handoff. No lifecycle merge blocker remains for the scoped audit PR. Full WCAG/authenticated visual acceptance and the broader backlog remain open.
