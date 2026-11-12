# Verification record — 2026-11-11

Environment: isolated local checkout integrating PR `683ca43` and main `8c25490`; Node24.22.1 (CI uses22), npm11.9.0, Bun1.4.4, Chromium via Playwright. `npm install --no-package-lock --no-save --no-audit --no-fund` used a workspace cache and did not change package manifests/lockfile. First install attempt failed because the default home npm cache was not writable; workspace cache succeeded. Tooling Bun/axe was installed outside the repository.

Build/runtime used dummy Supabase/Stripe values, localhost Supabase test stub `tests/mockSupabaseSocial.mjs` on3999, local Next production server on3100, guest checkout disabled and transactional emails disabled. No production credentials, account or application-data mutation was used. Existing mock API handlers can modify in-memory fixture objects; this is not Supabase production access.

| Check | Exact scope / command | Outcome |
|---|---|---|
| Carbon/scanner | `node --test tests/carbonDesignSystem*.test.mjs` | 6 pass,0 fail. Five existing lexical application assertions plus one scanner integration fixture. |
| Scanner | `node tools/design-system/static-audit.mjs --output=...` |173 entries,58 CSS,78 routes; source-inventory.json. Deterministic counts/hashes, no compliance rating. |
| Node suite | `node --experimental-vm-modules --test` followed by all45 discovered test files in lib/tests not importing bun:test |359 tests:354 pass,0 fail,5 skipped. Includes original Carbon checks/new scanner test. |
| Bun suite | `bun test` followed by all14 files importing bun:test |167 tests:161 pass,6 fail. |
| Bun failing file isolated | `bun test lib/collection/preview.test.js` |10 pass,6 fail; same failures, not cross-file mock leakage. |
| Existing HTML CI assertions | `node tests/verifyFacebookHtml.mjs`, `verifyHistoricalPrintHtml.mjs`, `verifyPrintProduction.mjs`, `verifyArtworkComments.mjs`, `verifyPrintSharing.mjs` against isolated server |All five exit0. These inspect crawler HTML/artifacts and mocked operational contracts, not full browser a11y. |
| TypeScript | `./node_modules/.bin/tsc --noEmit` |exit0; types.txt empty. |
| Build | dummy env + `npm run build` (`next build --webpack`) |exit0; build.txt includes route output. |
| Full lint | `npm run lint` |exit1:126 errors,101 warnings. Errors include existing TypeScript any, hooks, require imports, etc.; see lint.txt. No broad lint cleanup attempted. |
| Changed scanner/test lint | `eslint tools/design-system/static-audit.mjs tests/carbonDesignSystemScanner.test.mjs` |exit0, empty changed-lint.txt. |
| Git patch whitespace | `git diff --check` |Must remain clean before publication; final handoff records result. |

The first exploratory `node --test` sweep incorrectly included Bun tests and omitted the documented VM flag for checkoutShipping:342 pass,15 test-file failures,5 skips. Corrected commands above supersede those runner failures. Do not report them as15 application regressions or conceal the6 real Bun failures.

The6 Bun failures are in collection preview/shared read-only contract and legacy optional artwork test cases. `lib/collection/data.js:55` calls `.then(...).catch(...)`; the test database stub does not return a chainable Promise from its then implementation. This establishes broken verification infrastructure, not a demonstrated production collector failure. Those production files were unchanged by the audit. Repair fixture contract in a separate small PR and rerun assertions before claiming protected-flow coverage.

The5 Node skips are explicitly reported in node-tests.txt; no skipped test was counted as pass. GitHub Actions for this new integrated head has not been assumed green. Original-head runs are linked in the main audit.

## Browser evidence

`browser-observations.json` contains80 attempts:10 destinations×2 themes×4 widths (375/672/1056/1440, height900).16 protected-route attempts redirect to login.32 axe scans/full-page screenshots were captured on the8 public destinations at375/1440 in both themes. Screen reader, physical device and 200% zoom acceptance were not performed.

`themeAttribute` was absent because Carbon uses `.cds--g10/.cds--g100` classes in this version, not the attempted data attribute. The CSS class was confirmed in keyboard evidence and the computed shell colors were correct for the seeded theme. `plexLoaded:false` in the initial probe is not sufficient evidence that IBM Plex failed: the later loaded font-face records establish Sans300/400/600 and Mono400 for exercised text. Serif roles and all glyph/weight combinations remain unverified.

The minimal consent object initially seeded by the matrix was invalid under the actual parser (missing version,necessary,timestamp), so the fresh-consent banner stayed visible. This was discovered and retained as an explicit limitation. The keyboard probe used the real Necessary only button; optional cookies were never accepted.

Axe’s32 WCAG A/AA scans report selectors, failure summaries and unresolved manual checks. No finding count is a conformance percentage. Repeated failures across viewports/themes are not separate defects. Target-size breadcrumb reports need manual inline-text-exception adjudication. Missing images are intentional fixtures and their error-state presentation is in scope.

Scoped keyboard evidence: mobile filters open with initial focus in the Modal; Escape closes after transition, but focus returns to body instead of trigger. Custom cart drawer leaves focus on launcher and stays open after Escape. These are narrow probes, not full keyboard acceptance. The first immediate-after-Escape count was replaced with500ms delayed observation before drawing conclusions.

Screenshots were saved during the run; prints light/dark375 were visually inspected. All other captures are evidence artifacts requiring visual review. HTML assertion scripts and axe cannot replace a screen-reader or authenticated visual review.

## Reproduction

1. Install existing dependencies without updating manifest/lockfile; record actual Carbon versions.
2. Run isolated Supabase stub, use dummy environment values matching promotional-social CI and build/start on3100.
3. Split tests by bun:test vs node:test; include Node’s documented VM flag.
4. Use Playwright Chromium against localhost, seed theme cookie/localStorage, visit the listed routes/widths, capture computed values/overflow, run axe WCAG2/2.1/2.2 AA tags, and record final URL after redirects.
5. Exercise keyboard probes and saved-consent/authenticated fixtures separately. Never bypass auth guards or use production checkout to fill an evidence gap.

The original browser and keyboard capture scripts and32 screenshots are retained in the runtime evidence archive, not installed as application tests. Exporting that archive to the designated chat output folder failed with filesystem Permission denied; no downloadable screenshot bundle is claimed. Raw browser/keyboard/source JSON and check logs are committed here. Capture scripts used environment-specific executable/module paths and are not advertised as a portable CI gate.

Publication: audit continuation was published to PR #42 at2bc5956, with main integrated as a parent; PR remained draft/open/unmerged. Git whitespace check passed after normalizing carriage-return progress lines in build.txt. The initial updated-head Carbon run43114918387 and Promotional Social run43114918485 were in progress when inspected; do not infer success from local checks. This note is a subsequent documentation-only commit and may trigger new runs.

## Subsequent scoped WelcomePromoModal lifecycle correction

The records above describe the original audit snapshot, including its32 screenshots and80 route observations. They must not be relabeled as browser evidence for the later lifecycle correction. See [PROMO_LIFECYCLE.md](PROMO_LIFECYCLE.md) for the new committed actual-component browser regression, before/after source refs, current validation and CI results. The source-inventory.json hash for WelcomePromoModal is refreshed for the corrected source; other UI/style hashes are unchanged. No full audit or broad remediation was repeated.

Current main was separately checked at `8c25490`: Bun reproduced the same161 passes/6 failures and full lint the same126 errors/101 warnings, with zero additional normalized diagnostics. Those baseline failures were not repaired. The promo request/discount/auth contracts remain unchanged; only displayed-dialog lifecycle and its tests are corrected.
