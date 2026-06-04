# QA Findings Registry

Durable index for proactive QA findings. Use this for bugs found by `qa-feature`, `audit-pages`, `harden`, browser walks, Playwright traces, and future QA scripts.

## Status Values

- `open`: confirmed and not fixed.
- `in-progress`: fix is underway.
- `fixed`: fixed and proof has passed.
- `deferred`: accepted risk or out of scope for the current sprint.

## Finding Lifecycle

1. Create a finding only when the issue is reproducible or has durable evidence.
2. Keep the finding in `Open Findings` while the issue is unresolved, even if a fix is being attempted.
3. Set status to `fixed` only after the `Proof required` command or manual replay passes.
4. Move fixed findings to `Closed Findings` in the same change that records the proof result.
5. If the issue is intentionally not fixed, set status to `deferred` and keep the reason in `Notes`.
6. If a finding is noisy or stale, either refresh the evidence or close it as superseded; do not let unowned findings accumulate.

## Flake Budget

Active Nightly specs are trusted only while they stay reliable. Track repeated Nightly failures in `docs/qa/nightly-history.md`.

- A single failure opens or updates a finding with the failed command and trace/screenshot path.
- Two failures for the same active spec within 14 days mark it `test-flake` unless a product bug is proven.
- Below roughly 95% pass rate over the last 14 scheduled runs, demote the spec from `Nightly Active` to `Nightly Candidates / Repair Queue` in `docs/qa/e2e-suite-map.md`.
- Re-promote only after the spec passes alone and in the full active Nightly command with `--retries=0`.

## Severity Values

- `blocker`: prevents a target role from completing a core workflow.
- `high`: user-facing workflow failure, silent failure, data loss risk, or role/RLS mismatch.
- `medium`: confusing, stale, inaccessible, or missing feedback but workaround exists.
- `low`: polish, noisy warning, or low-risk inconsistency.

## Pattern Values

Use the closest existing pattern before inventing a new one:

- `silent-no-op`
- `missing-feedback`
- `missing-loading-state`
- `hidden-validation`
- `validation-visible-mismatch`
- `role-scope-empty`
- `role-rls-mismatch`
- `mutation-stale-cache`
- `swallowed-error`
- `stale-derived-state`
- `broken-navigation`
- `console-error`
- `network-error`
- `mobile-layout-break`
- `accessibility-gap`
- `test-flake`

## Finding Template

Copy this block for each new finding.

```markdown
### QA-<PATTERN>-###

- **Status:** open
- **Severity:** high
- **Role:** exhibitor | secretary | judge | steward | admin | all
- **Surface:** route/component/file
- **Suite category:** pr-smoke | nightly | feature-audit | manual-debug | candidate-delete | none
- **Pattern:** silent-no-op
- **Detected by:** qa-feature | audit-pages | harden | Playwright | manual | script
- **Evidence:** code reference, trace path, screenshot path, console/network output, or reproduction steps
- **User impact:** what the user experiences in plain English
- **Intent check:** which role feeling is harmed or preserved
- **Fix owner:** file/module area
- **Proof required:** exact test, command, or manual replay required before closing
- **Notes:** optional context, linked PR, migration number, or deferral reason
```

## Open Findings

### QA-TEST-FLAKE-010

- **Status:** open
- **Severity:** medium
- **Role:** secretary
- **Surface:** Wave 1 Nightly Playwright command from `docs/qa/e2e-suite-map.md`; failures observed in `cross-role-workflows.spec.ts`, `registration/entryCreationCore.spec.ts`, `registration/secretaryExistingUsers.spec.ts`, and `registration/singleDogSingleClass.spec.ts`.
- **Suite category:** nightly
- **Pattern:** test-flake
- **Detected by:** Playwright
- **Evidence:** 2026-05-27 active Nightly Playwright command was stopped per the QA hang rule after the runner reported long-running failures (`entryCreationCore.spec.ts` status workflow at 16.8m, `secretaryExistingUsers.spec.ts` existing-user search at 15.5m, and `singleDogSingleClass.spec.ts` at 6.4m). The same mainline branch also failed the secretary command-center assertion in `cross-role-workflows.spec.ts`. Route sweep passed separately (`12/12` role+viewport checks), so this is isolated to the active Playwright gate rather than a broad route-health outage. 2026-05-28 repeated the failure on clean synced `main`: promoted Vitest passed (`18/18`), active Playwright failed after `31/44` passed, `9` failed, and `4` did not run. Long-running failures again violated the QA hang threshold: `singleDogSingleClass.spec.ts` took `16.7m`, `show-wizard-officials.spec.ts` had two `networkidle` timeouts around `16m`, and `evidence.spec.ts` took `4.2m`. The 2026-05-28 route sweep passed (`12/12` role+viewport checks). 2026-05-28 second-pass re-run later in the same session completed the full Wave 1 command at `33 passed, 7 failed, 4 did not run, 6.1m` with no individual spec exceeding 50s — `singleDogSingleClass.spec.ts` passed in 3.0s, `evidence.spec.ts` passed in 3.8s, and the `show-wizard-officials` failures collapsed to ~32s networkidle timeouts, confirming that the suite's runtime is itself highly variable. The reproducible failure cluster across both 2026-05-28 runs: (a) `cross-role-workflows.spec.ts:39` and `uat/secretary/critical-path.spec.ts:43` assert `getByRole('button', { name: /Tasks/ })` and `/Messages/` but the current secretary dashboard renders `Messages` only as a sidebar link and `Tasks` only as the inline `TasksTab` component (see [`apps/myk9show/src/pages/secretary/SecretaryDashboardPage/index.tsx`](../../apps/myk9show/src/pages/secretary/SecretaryDashboardPage/index.tsx)) — those affordances are gone, not just relocated; (b) `secretary/show-wizard-officials.spec.ts:25/47/56` chairman-picker assertion + `ShowCreationWizardPage.goto()` `waitForLoadState('networkidle')` timeouts; (c) `secretary-entry-walk.spec.ts:145` `submit_show_entries` RPC never fires; (d) `uat/secretary/disposable-entry.spec.ts:59` re-emergence of the closed QA-TEST-FLAKE-001 search-for-seeded-dog pattern.
- **User impact:** Nightly cannot currently prove the trusted secretary/registration baseline from `main`; results are contaminated by already-diagnosed stale assertions and slow registration specs.
- **Intent check:** Restores QA trust around the secretary "That was easy" proof once the active Nightly gate is green again.
- **Fix owner:** Active Nightly Playwright specs and secretary/registration proof setup. PR `#372` contained a prior stabilization attempt, but it is now closed without merge, so the next repair should start from current `main` and avoid assuming that branch is the accepted fix.
- **Proof required:** Rerun the exact active Nightly Playwright command from `docs/qa/e2e-suite-map.md` with `--retries=0` and confirm the full command passes without >60-second stalls. Also keep the route sweep green across public, exhibitor, secretary, judge, club-admin, and admin route groups.
- **Notes:** Opened from the 2026-05-27 run and refreshed on 2026-05-28 after a second consecutive active Playwright failure on `main`. Candidate next step: focused repair of stale secretary dashboard expectations, dog-search waits, show-wizard officials navigation waits, secretary-entry submit proof, disposable-entry seed/search proof, and UAT sign-in reliability.
- **2026-05-30 update — contaminated by cross-agent contention; product surfaces look healthy.** Wave 1 ran `35 passed, 5 failed, 4 did not run (5.5m)` with `--retries=0`, no single spec exceeding the hang threshold (slow specs ~32s). The 5 failures: `secretary/show-wizard-officials.spec.ts:25` and `:47`, `secretary-entry-walk.spec.ts:20`, `uat/secretary/critical-path.spec.ts:32` (asserts `Tasks`/`Messages` buttons — the consolidated dashboard now uses a `Personal tasks` heading + `Messages` link, which the maintained `cross-role-workflows.spec.ts:34` asserts and **passed** tonight), and `uat/secretary/disposable-entry.spec.ts:48`. **Dominant confound:** a concurrent `playwright test` process (pid 58635) from another agent in the shared main-repo working tree was running an overlapping set — `secretary-entry-walk, critical-path, qa-regression-proof, show-wizard-officials, disposable-entry` — against the same fixed dev-server port 5173 (`playwright.config.ts:68-71`, `reuseExistingServer: !CI`). Four of the five failing specs are exactly the specs the other agent was running concurrently. Focused isolation re-run: `singleDogSingleClass.spec.ts` passes alone (4.3s); the `show-wizard-officials` retry hit `net::ERR_CONNECTION_REFUSED at 127.0.0.1:5173` + `networkidle` 30s timeouts as the shared server cycled — isolation inconclusive due to contention. Independently the Phase 2 route sweep rendered `/secretary/dashboard`, `/secretary/create-show`, `/secretary/entries/:id`, `/secretary/reports`, `/secretary/settings` cleanly (0 console errors), arguing the secretary product paths are healthy and these are harness/contention + known stale assertions, not product regressions. PR #448 handled the smart-sign-in selector repair for specs/page objects that still assumed a one-step email/password form. Remaining repair (stale `critical-path` button assertions; `networkidle` waits in `page-objects/LoginPage.ts` + `page-objects/ShowCreationWizardPage.ts`) must be verified from an isolated single-occupant tree/port — see `docs/qa/nightly-history.md` (2026-05-30).
- **2026-06-02 update — this finding's enumerated specs passed.** Wave 1 (`41 passed, 3 failed, 2.7m`, `--retries=0`) saw all four specs named in this finding's Surface — `cross-role-workflows.spec.ts`, `registration/entryCreationCore.spec.ts`, `registration/secretaryExistingUsers.spec.ts`, `registration/singleDogSingleClass.spec.ts` — pass cleanly. The three failures were a different, non-flaky cluster: a hardcoded-date time-bomb in the wizard date pickers (`QA-TEST-FLAKE-016`, fixed) and the announcements realtime channel-reuse error (`QA-CONSOLE-ERROR-017`, fixed), not the contention/stale-assertion cluster tracked here. Note a concurrent agent was active in the shared tree tonight (it deleted this run's throwaway probe specs mid-session), so this is encouraging signal rather than a full clearance.
- **2026-06-04 update — ACTIVE NIGHTLY FAILED AGAIN.** Phase 1 Vitest passed (`18/18`), but the exact active Playwright command failed `39/44` over `1.1h` with `--retries=0`. Failures: `cross-role-workflows.spec.ts:21` timed out after 16.1m waiting for the `/shows` heading; `registration/exhibitorSelfRegistration.spec.ts:212` timed out after 15.9m waiting for the entry receipt heading; `registration/singleDogSingleClass.spec.ts:117` timed out selecting the seeded `Bravo` dog row; `secretary/show-creation-wizard.spec.ts:32` timed out navigating to the wizard sign-in return URL; and `secretary-entry-walk.spec.ts:21` timed out waiting for `submit_show_entries` while the "Next" click was unstable/outside the viewport. Evidence paths are recorded in `docs/qa/nightly-history.md` (2026-06-04). The temporary route-health sweep was also partial: public, judge, club-admin, and admin passed, while exhibitor and secretary route-group probes hit the 90s test budget. This refreshes the flake/harness instability rather than proving a single product regression. Next repair should run the five failed specs in isolation from a dedicated worktree/unique port before touching product code.

### QA-CONSOLE-ERROR-011

- **Status:** open
- **Severity:** high
- **Role:** all (every authenticated role)
- **Surface:** `apps/myk9show/src/services/replication/ReplicatedClassesTable.ts` and the broader replicated-table sync layer; observed on every authenticated route across exhibitor, secretary, judge, club-admin, and admin route groups.
- **Suite category:** none (surfaced by route-health sweep)
- **Pattern:** network-error
- **Detected by:** audit-pages
- **Evidence:** 2026-05-28 route-health sweep with explicit console-error counting across public, exhibitor, secretary, judge, club-admin, and admin route groups at desktop plus 375px mobile. Public routes were clean (`18/18`); every authenticated role flooded the console with 12–14 errors per route. Representative messages on each route:
  - `[classes] Sync failed: Error: Supabase query failed: TypeError: Failed to fetch at ReplicatedClassesTable.sync (http://127.0.0.1:5173/src/services/replication/...)`
  - `[ERROR] [database] 💥 Database query failed: {data: Object, stack: undefined}` (repeated 11–13 times)
    Critically, the sweep recorded **zero owned 4xx/5xx network responses** on these routes — `TypeError: Failed to fetch` indicates the fetch never reached Supabase (network/CORS/abort) rather than a Supabase rejection. A focused replay limited to the secretary role in a fresh Playwright context (`pnpm test:e2e:clean src/test/e2e/temp-route-sweep-2026-05-28.spec.ts --grep "secretary routes" --retries=0`) reproduced the same flood, so this is not the stale-auth-across-role-groups harness flake from 2026-05-24. Pages still render visually; the failures are silent at the UI layer but loud in the console.
- **User impact:** Every signed-in role sees a quiet but constant replication-layer failure. The replicated classes table is the backbone of offline-first reads; if its sync is failing this aggressively, secretary and judge show-day surfaces may be relying on stale local data without the user realizing the live channel is dead. Risk of stale derived state platform-wide.
- **Intent check:** Harms the cross-role expectation that authenticated pages feel quiet and trustworthy. The secretary "That was easy" feeling specifically depends on classes data being fresh.
- **Fix owner:** `apps/myk9show/src/services/replication/ReplicatedClassesTable.ts` and the shared `ReplicatedTable.sync` plumbing in `packages/replication`; investigation should also confirm whether the surrounding `[database] Database query failed: {stack: undefined}` log lines share the same root cause or are a separate logger swallowing real errors.
- **Proof required:** Re-run the route-health sweep covering all six role groups at desktop plus 375px mobile after a fix and confirm `Clean: N/N` for every authenticated route (matching the public baseline). Provisional fixture: a focused secretary-only run with the spec used today (`temp-route-sweep-*.spec.ts`-style probe) should print `Clean: 20/20`.
- **Notes:** Closed finding `QA-CONSOLE-ERROR-005` (2026-05-22) used the same `[database] 💥 Database query failed: {stack: undefined}` signature on `/secretary/entries/:showId` and was closed by a passing route-sweep proof rather than a code change; that closure may have been premature, or the failure surface widened since. The Wave 1 Playwright suite does not assert console-error-free pages, which is why this regression went latent. Recommend adding a console-error budget to one or two route-health-style specs once the underlying fetch failure is fixed.
- **2026-05-30 update — DID NOT REPRODUCE.** The Phase 2 route sweep covered all six role groups (40 routes at desktop + 375px) and recorded **`repl=0` (zero replication/`Failed to fetch`/`Database query failed` console errors) on every authenticated route**: exhibitor `12/12`, secretary `5/6` (the 6th is the unrelated `/people` blank render — `QA-LOADING-STATE-013`, no console errors), judge `4/4`, club-admin `1/1`, admin `9/9`. Public `8/8` clean. This matches this finding's `Proof required`. Supabase was reachable from the host throughout (`GET /auth/v1/health` → `HTTP 401` in 66ms), and `TypeError: Failed to fetch` is a network-reach failure rather than a Supabase rejection, so the 2026-05-28 flood was most likely a transient local connectivity problem in that session, not a code defect. **Kept `open` deliberately** to avoid repeating the `QA-CONSOLE-ERROR-005` premature-closure mistake: close after one more clean scheduled run also reports `repl=0` for every authenticated route, OR after a committed console-error-budget spec lands (see recommendation above). Downgrade candidate: `high` → `low` given non-reproduction.
- **2026-06-02 update — DID NOT REPRODUCE (2nd consecutive clean run).** Phase 2 route sweep from a single-occupant tree (dev server reused on 5173, serving the nightly branch at `origin/main` `b4cd3ea2`) covered all six role groups, 50 routes at desktop + 375px. Every authenticated route reported `repl011=0` (zero `Failed to fetch` / `ReplicatedClassesTable` / `Database query failed` console errors): exhibitor `11/11`, secretary `13/13` repl-clean, judge `4/4`, club-admin `1/1`, admin `13/13`. Public `8/8`. This satisfies `Proof required` for a second scheduled run. **Recommendation:** downgrade to `low` now and close after the committed console-error-budget route spec lands (or one more clean scheduled run), per this finding's own anti-premature-closure note.
- **2026-06-04 update — DID NOT REPRODUCE ON COMPLETED ROUTE GROUPS.** Public, judge, club-admin, and admin route groups completed with zero console errors and zero owned 4xx/5xx responses. The exhibitor and secretary route groups timed out before producing full summaries, so this finding stays open despite no visible replication flood in the captured failure snapshots.

### QA-MOBILE-LAYOUT-BREAK-012

- **Status:** open
- **Severity:** medium
- **Role:** public (all)
- **Surface:** public home route `/` at 375px mobile width.
- **Suite category:** none (surfaced by route-health sweep; nearest existing spec is `public-shows-responsive.spec.ts`, which covers `/shows` not `/`)
- **Pattern:** mobile-layout-break
- **Detected by:** audit-pages
- **Evidence:** 2026-05-30 route-health sweep measured `document.documentElement.scrollWidth - window.innerWidth = 52px` of horizontal overflow on `/` at a 375px viewport. It was the only route of 40 swept (6 role groups, desktop + 375px) to report non-zero overflow — every other public, exhibitor, secretary, judge, club-admin, and admin route reported `overflow=0px`, so this is specific to the landing page, not a global measurement artifact. The page otherwise renders fine (`render=ok`, 0 console errors, 0 owned 4xx/5xx). Measurement is deterministic and contention-independent (a static layout read).
- **User impact:** First-time visitors on a phone get a horizontally-scrollable landing page — content can be clipped or shifted, undercutting the first-impression polish the public/exhibitor experience depends on.
- **Intent check:** Harms the public/exhibitor target feeling that the platform looks trustworthy and considered before sign-up.
- **Fix owner:** public landing page layout (`apps/myk9show/src/pages` home/landing component and any full-bleed hero/section that exceeds the viewport width at 375px).
- **Proof required:** Focused 375px replay of `/` confirming `scrollWidth - innerWidth <= 0` (or fold into `public-shows-responsive.spec.ts` as a `/` overflow assertion).
- **Notes:** Low-risk to fix once the overflowing element is identified (usually a fixed-width hero, image, or negative-margin section). Not fixed this run because the route sweep ran while a concurrent agent held the dev server, and the project convention is to verify fixes from a clean tree.
- **2026-06-02 update — REPRODUCED, deterministic.** Phase 2 route sweep measured `scrollWidth - innerWidth = 52px` on `/` at 375px again — identical to 2026-05-30, and again the only non-zero overflow of all 50 routes swept (every other route `overflow=0px`). This confirms the bug is a stable layout defect, not the contention artifact the prior note hedged on: tonight's sweep ran from a single-occupant tree and still measured exactly 52px. Render is otherwise clean (`render=ok`, 0 console errors, 0 owned 4xx/5xx). Still unfixed — pinpointing the overflowing element on the multi-section landing (`HomeRedirect` → Hero/Features/Pricing/FAQ/etc.) needs per-element runtime measurement, which is out of scope for the autonomous gate but is now a clean, fix-ready ticket.
- **2026-06-04 update — INCONCLUSIVE CLEAN MEASUREMENT.** The public route sweep completed cleanly and measured `/` at 375px with `overflow=0`, but this finding reproduced identically on 2026-05-30 and 2026-06-02. Keep it open until a focused `/` mobile overflow replay confirms whether the layout changed or the temporary route-health measurement varied.

### QA-LOADING-STATE-013

- **Status:** open
- **Severity:** medium
- **Role:** secretary
- **Surface:** `/people` (authenticated; audited under the secretary group).
- **Suite category:** none (surfaced by route-health sweep; `people-page-ui.spec.ts` / `entities/peopleUI.spec.ts` are feature-audit, not active nightly)
- **Pattern:** missing-loading-state
- **Detected by:** audit-pages
- **Evidence:** 2026-05-30 route-health sweep, secretary session: `/people` reported `render=BLANK` (body innerText ≤ 20 chars after a 3s settle) with `skeleton=present` and **no** console errors and **no** owned 4xx/5xx responses. Notably this was within a session where the five preceding secretary routes (`/secretary/dashboard`, `/secretary/create-show`, `/secretary/entries/:id`, `/secretary/reports`, `/secretary/settings`) all rendered `ok`, so it is specific to `/people`, not a session-wide auth/contention failure. Per `.agents/skills/audit-pages` ("a skeleton that never resolves is a bug"), a persistent skeleton with empty body text is a defect candidate.
- **User impact:** A secretary opening the People directory may see a blank/perpetual-skeleton page with no data and no error explanation.
- **Intent check:** Harms the secretary target feeling of calm control — a core directory surface appears broken with no feedback.
- **Fix owner:** `/people` page data load (people list query/hook and its loading→empty→data state handling).
- **Proof required:** Clean-environment replay of `/people` as secretary with a longer settle (8–10s) to distinguish a genuinely stuck skeleton from a slow-but-resolving load; if stuck, add an empty/error state and a focused render proof. **Provisional** until replayed without the concurrent-agent dev-server contention present tonight.
- **Notes:** Possible confound: the 3s settle window plus a contended shared dev server could under-wait a slow list. Logged as provisional rather than fixed for that reason; the proof command must run from a single-occupant tree/port.
- **2026-06-02 update — DID NOT REPRODUCE.** Phase 2 route sweep (secretary session, single-occupant tree) reported `/people` `render=ok` with `skeleton=0`, `consoleErr=0`, `overflow=0px` — a clean render alongside all 12 other secretary routes (`13/13` rendered). This supports the provisional contention-confound hypothesis: the 2026-05-30 blank render was most likely the contended shared dev server under-waiting a slow list, not a missing loading state. **Recommendation:** close as non-reproducing after one more clean scheduled run, or fold a `/people` render assertion into `entities/peopleUI.spec.ts`.

### QA-MISSING-LOADING-STATE-015

- **Status:** open
- **Severity:** high
- **Role:** admin
- **Surface:** `/admin/dashboard`
- **Suite category:** none (surfaced by route-health sweep)
- **Pattern:** missing-loading-state
- **Detected by:** audit-pages
- **Evidence:** 2026-05-30 route-health sweep across public, exhibitor, secretary, judge, club-admin, and admin route groups at desktop plus 375px mobile passed `10/12` route/viewport checks. Both admin dashboard checks failed because `/admin/dashboard` remained on visible `Loading...` text after 5 seconds. Evidence paths: `apps/myk9show/test-results/__tmp-nightly-route-sweep--7f93e-s-render-cleanly-at-desktop-chromium/error-context.md` and `apps/myk9show/test-results/__tmp-nightly-route-sweep--46cf9-es-render-cleanly-at-mobile-chromium/error-context.md`.
- **User impact:** Site admins can land on a dashboard that never resolves, leaving platform-health information unavailable.
- **Intent check:** Harms the admin target feeling that "the platform is healthy"; a stuck loading dashboard gives no actionable status.
- **Fix owner:** admin dashboard data-loading and role/permission gating path.
- **Proof required:** Re-run the route-health sweep or focused `/admin/dashboard` desktop/mobile replay and confirm the dashboard resolves with no visible unresolved loading state, no console errors, and no owned 4xx/5xx responses.
- **Notes:** Do not auto-fix without inventorying admin role, permission, and data queries first; this may be role-scope, missing seed/config, or an async loading-state bug.
- **2026-06-02 update — DID NOT REPRODUCE.** Phase 2 route sweep (site-admin session, single-occupant tree) reported `/admin/dashboard` `render=ok` with `skeleton=0`, `consoleErr=0`, `overflow=0px`, and all 13 admin routes rendered (`13/13`). No persistent `Loading...` text after the settle window. Like `QA-LOADING-STATE-013`, the 2026-05-30 stuck-loading evidence was gathered during cross-agent dev-server contention. **Recommendation:** close as non-reproducing after one more clean scheduled run confirms `/admin/dashboard` resolves; keep open for now given the original `high` severity and single clean observation.
- **2026-06-04 update — DID NOT REPRODUCE AGAIN.** The admin route group completed cleanly; `/admin/dashboard` rendered at desktop and 375px with `skeleton=0`, `consoleErrors=[]`, `networkErrors=[]`, and `overflow=0`. This is the second clean scheduled replay after the original 2026-05-30 evidence. This finding is now a closure candidate as stale/non-reproducing, but it remains open in this docs-only update because the overall route sweep was partial.

## Closed Findings

### QA-CONSOLE-ERROR-017

- **Status:** fixed
- **Severity:** medium
- **Role:** secretary (any role that mounts the announcements subscription)
- **Surface:** `apps/myk9show/src/store/announcementStore.ts` `subscribe()`; observed as a console error on `/secretary/dashboard`, `/secretary/results-control`, `/secretary/results-submission`, and `/secretary/reports`.
- **Suite category:** nightly (caught by `uat/secretary/qa-regression-proof.spec.ts` strict browser-health gate)
- **Pattern:** console-error
- **Detected by:** Playwright (Wave 1 gate) + audit-pages (route sweep)
- **Evidence:** 2026-06-02 Wave 1 gate failed `qa-regression-proof.spec.ts:40` (dashboard) in its strict browser-health `afterEach` on `console error: [announcements] Failed to subscribe to announcements: {data: Error: cannot add 'postgres_changes' callbacks for realtime:announcements-<uuid>, stack: undefined}` (`apps/myk9show/src/store/announcementStore.ts:163`). The Phase 2 route sweep then reproduced the **same** error (same `announcements-0aedd946-…` topic) deterministically on three secretary results/reports routes — a focused navigation capture printed `3/3` routes with the error. Root cause confirmed against `@supabase/realtime-js@2.106.2` `RealtimeClient.channel(topic)`, which returns an **existing** channel when one with that topic is already registered; under a React StrictMode double-mount the second async `subscribe()` continuation reuses an already-joined `announcements-<id>` channel, and adding `.on('postgres_changes')` to a subscribed channel throws.
- **User impact:** Secretaries on show-day surfaces saw a quiet but repeated console error and a failed announcements realtime subscription (the catch block also set the store `error` and left `isLoading`), so live announcement updates could silently fail to attach. Page render was unaffected.
- **Intent check:** Restores the secretary "That was easy" / calm-control feeling — a show-day surface no longer logs a recurring subscription failure.
- **Fix owner:** `apps/myk9show/src/store/announcementStore.ts`.
- **Proof required:** Reproduced 3/3 before the fix; after the fix a clean-tree navigation capture across the three secretary results/reports routes printed `0` announcements console errors, the full `qa-regression-proof.spec.ts` passed `7/7` (including the dashboard browser-health gate), and `announcementStore.test.ts` passed `12/12` with a new regression test asserting a stale same-topic channel is removed before re-subscribe.
- **Notes:** Fixed by removing any stale channel whose topic matches `realtime:announcements-<id>` (via `supabase.getChannels()` + `await supabase.removeChannel()`) before creating the new channel, so `subscribe()` always builds a fresh subscription. No-op on the happy path (no stale channel → unchanged behavior). The throw is StrictMode/dev-amplified but the defensive cleanup also hardens any production fast-re-subscribe race.

### QA-TEST-FLAKE-016

- **Status:** fixed
- **Severity:** medium
- **Role:** secretary
- **Surface:** `apps/myk9show/src/test/e2e/uat/secretary/qa-regression-proof.spec.ts` and `apps/myk9show/src/test/e2e/secretary/show-creation-wizard.spec.ts` — show-creation wizard Show Dates / Entry Period range pickers.
- **Suite category:** nightly
- **Pattern:** test-flake
- **Detected by:** Playwright (Wave 1 gate)
- **Evidence:** 2026-06-02 Wave 1 gate failed `show-creation-wizard.spec.ts:31` and `qa-regression-proof.spec.ts:57` with `expect(getByRole('dialog')…getByRole('button', { name: /May 30th, 2026/i })).toBeVisible()` timing out (`element(s) not found`). Both specs hardcoded the calendar dates `May 30th/June 2nd/May 1st/June 5th, 2026`. The wizard `DateRangePicker` opens on the current month and applies no `minDate` (`ShowDetailsStep.tsx` passes none; `date-range-picker.tsx:219` disables nothing when `minDate` is undefined), so on 2026-06-02 the picker opened on June and the May day buttons were no longer rendered in the grid — a date time-bomb that passed only while "today" was still in May.
- **User impact:** None to end users — test-only. But it broke the secretary regression gate, masking real wizard regressions behind a calendar-rollover false failure.
- **Intent check:** Preserves the strict secretary regression proof's trustworthiness — the gate now fails only on real wizard defects.
- **Fix owner:** `apps/myk9show/src/test/e2e/shared/wizardDates.ts` (new shared helper).
- **Proof required:** After the fix, both specs passed in full from a clean tree: `show-creation-wizard.spec.ts` `4/4` and `qa-regression-proof.spec.ts` `7/7` (`pnpm test:e2e:clean … --project=chromium --workers=1 --timeout=90000 --retries=0`).
- **Notes:** Fixed by deriving the four calendar days (5th/10th/14th/20th) and their display strings from `new Date()` in a shared `currentMonthWizardDates()` helper, anchored to fixed day-of-month positions in the current month so they always render in the default grid and never rot. Removed the duplicated hardcoded dates from both specs.

### QA-TEST-FLAKE-014

- **Status:** fixed
- **Severity:** high
- **Role:** exhibitor | secretary | judge
- **Surface:** Active Nightly Playwright sign-in helpers/specs after the Smart Sign-In rollout.
- **Suite category:** nightly
- **Pattern:** test-flake
- **Detected by:** Playwright
- **Evidence:** 2026-05-30 active Nightly initially failed `25` specs because tests still waited for removed one-step selectors (`data-testid="email-input"`, immediate password field, and `sign-in-button`) after `SmartSignInPage` introduced a two-step email/passcode then password flow. Representative failures came from `cross-role-workflows.spec.ts`, `registration/secretaryExistingUsers.spec.ts`, `registration/secretaryNewUsers.spec.ts`, `registration/singleDogSingleClass.spec.ts`, `registration/exhibitorSelfRegistration.spec.ts`, `secretary-entry-walk.spec.ts`, `simple-connectivity.spec.ts`, and shared UAT auth.
- **User impact:** Nightly could not prove current workflows because its auth setup no longer matched the real sign-in UI.
- **Intent check:** Preserves the new sign-in intent while restoring QA signal; the tests now walk the same two-step experience users see.
- **Fix owner:** active Nightly Playwright auth helpers and dashboard smoke assertions.
- **Proof required:** Passed on 2026-05-30: focused smart-sign-in proof covering cross-role, registration, class creation, exhibitor self-registration, single-dog registration, and simple connectivity (`13/13` after dashboard expectation update), plus the exact active Nightly rerun improved from `15/44` to `34/44` with all smart-sign-in selector failures cleared.
- **Notes:** Also updated stale secretary dashboard expectations from `Tasks`/`Messages` buttons to the current `Personal tasks` heading plus `Messages` navigation link.

### QA-TEST-FLAKE-009

- **Status:** fixed
- **Severity:** medium
- **Role:** secretary
- **Surface:** `apps/myk9show/src/test/e2e/registration/entryCreationCore.spec.ts`, `apps/myk9show/src/test/e2e/secretary/show-creation-wizard.spec.ts`
- **Suite category:** nightly
- **Pattern:** test-flake
- **Detected by:** Playwright
- **Evidence:** 2026-05-23 active Nightly initially failed `43/45`. `entryCreationCore.spec.ts` timed out in the browser-side show-statistics direct-store check, with evidence at `apps/myk9show/test-results/registration-entryCreation-2f2cf-egrate-with-show-statistics-chromium/error-context.md`. `show-creation-wizard.spec.ts` failed clicking the date-picker `Done` button because the element became unstable/outside the viewport, with evidence at `apps/myk9show/test-results/secretary-show-creation-wi-ca4cd-and-independent-date-ranges-chromium/error-context.md`.
- **User impact:** Nightly could not reliably prove active registration and secretary show-wizard coverage even though the underlying product paths were covered by stronger maintained proofs.
- **Intent check:** Preserves QA trust in the secretary "That was easy" regression proof by removing stale duplicate browser-store coverage and stabilizing a date-picker interaction helper.
- **Fix owner:** registration and show-wizard Playwright proof setup.
- **Proof required:** Passed on 2026-05-23: promoted Vitest Nightly (`18 passed`), focused two-spec Playwright proof (`8 passed`), and full active Nightly Playwright command from `docs/qa/e2e-suite-map.md` with `--retries=0` (`44 passed`).
- **Notes:** The removed show-statistics browser check duplicated promoted `entryStore.multiClass.test.ts` and related entry-store unit coverage. The show-wizard helper now verifies the dialog button is visible before invoking the DOM click, avoiding a viewport/stability-only Playwright flake.

### QA-NETWORK-ERROR-008

- **Status:** fixed
- **Severity:** high
- **Role:** exhibitor | secretary
- **Surface:** `apps/myk9show/src/hooks/queries/useShowDayData.ts`, `apps/myk9show/src/hooks/queries/useClassCheckInData.ts`
- **Suite category:** nightly
- **Pattern:** network-error
- **Detected by:** Playwright
- **Evidence:** 2026-05-22 active Nightly initially failed both `qa-regression-proof.spec.ts` tests with owned Supabase `400 GET /rest/v1/entries?...class:classes!...ring_number...`. A focused REST replay returned Postgres `42703`: `column classes_1.ring_number does not exist`. `rg "ring_number" supabase/migrations` found no migration adding that column.
- **User impact:** Show-day and check-in data could fail behind otherwise rendered pages, making secretary/exhibitor show-day routes unreliable and causing Nightly browser health to fail.
- **Intent check:** Restores the secretary/exhibitor expectation that show-day status pages load quietly and predictably.
- **Fix owner:** show-day and class check-in query mapping.
- **Proof required:** Passed on 2026-05-22: focused `qa-regression-proof.spec.ts` (`3 passed`), focused show-day/check-in Vitest (`37 passed`), and full active Nightly Playwright command from `docs/qa/e2e-suite-map.md` with `--retries=0` (`45 passed`).
- **Notes:** Fixed by removing the stale `classes.ring_number` select and mapping currently unavailable ring values to the existing null/default UI contract.

### QA-TEST-FLAKE-004

- **Status:** fixed
- **Severity:** medium
- **Role:** secretary
- **Surface:** `apps/myk9show/src/test/e2e/registration/entryCreationCore.spec.ts`, `apps/myk9show/src/test/e2e/registration/singleDogSingleClass.spec.ts`, `apps/myk9show/src/test/e2e/uat/secretary/critical-path.spec.ts`
- **Suite category:** nightly
- **Pattern:** test-flake
- **Detected by:** Playwright
- **Evidence:** 2026-05-21 active Nightly command failed after `40 passed`, `3 failed`, and `2 did not run`. Failures were `entryCreationCore.spec.ts:64`, `singleDogSingleClass.spec.ts:110`, and `critical-path.spec.ts:63`. On 2026-05-22, focused replay showed `singleDogSingleClass.spec.ts` could still miss seeded dog `Bravo` when it signed in through `/secretary/dashboard` before jumping to the registration route.
- **User impact:** Nightly could not reliably prove the secretary registration/payment path.
- **Intent check:** Restores QA trust around the secretary "That was easy" registration proof by removing route-order sensitivity from the spec.
- **Fix owner:** registration Playwright proof setup.
- **Proof required:** Passed on 2026-05-22: focused rerun of the three failed specs (`11 passed`) and full active Nightly Playwright command from `docs/qa/e2e-suite-map.md` with `--retries=0` (`45 passed`).
- **Notes:** Fixed by sending the spec through the same direct `returnTo=/secretary/register/:showId` sign-in path used by the maintained secretary UAT proof, and by waiting for the server dog-search response before selecting `Bravo`.

### QA-CONSOLE-ERROR-005

- **Status:** fixed
- **Severity:** medium
- **Role:** secretary
- **Surface:** `/secretary/entries/:showId` and `/secretary/reports`
- **Suite category:** none
- **Pattern:** console-error
- **Detected by:** audit-pages
- **Evidence:** 2026-05-21 route-health sweep logged `[ERROR] [secretary] Error loading entries: {stack: undefined}` on `/secretary/entries/4584f257-19b5-4016-aae6-5e7827b769cb` at 375px and `/secretary/reports` at 1280px.
- **User impact:** Secretary routes rendered, but entry-backed data could be missing or stale without a clear user-facing explanation.
- **Intent check:** Preserves the secretary target feeling of calm control by keeping entry-backed routes free of background load errors.
- **Fix owner:** `apps/myk9show/src/hooks/useEntryManagementData.ts` and entry query/RLS path behind `getEntriesForShow`.
- **Proof required:** Passed on 2026-05-22 route-health sweep: `/secretary/entries/4584f257-19b5-4016-aae6-5e7827b769cb` and `/secretary/reports` rendered at desktop and 375px with no console errors or owned 4xx/5xx responses.
- **Notes:** Closed by route-sweep proof; no code change was needed in this run.

### QA-CONSOLE-ERROR-007

- **Status:** fixed
- **Severity:** low
- **Role:** admin
- **Surface:** `/admin/permissions`
- **Suite category:** none
- **Pattern:** console-error
- **Detected by:** audit-pages
- **Evidence:** 2026-05-21 route-health sweep logged repeated React duplicate-key warnings on `/admin/permissions` at desktop and 375px. Browser console args identified the repeated key as a generated RBAC role key.
- **User impact:** Admin permissions page rendered, but repeated React key collisions could cause unstable list identity or duplicated/omitted rows.
- **Intent check:** Preserves admin confidence by removing noisy, low-level render instability from a permission-management surface.
- **Fix owner:** `apps/myk9show/src/services/rbac/PermissionChecker.ts`, `apps/myk9show/src/pages/admin/permissions/PermissionManagementPage.tsx`
- **Proof required:** Passed on 2026-05-21 with focused browser replay of `/admin/permissions`: `errors=0 duplicateKey=0`.
- **Notes:** Fixed by including role scope in generated user-role row IDs so scoped assignments keep stable React identity.

### QA-NETWORK-ERROR-006

- **Status:** fixed
- **Severity:** low
- **Role:** public
- **Surface:** `/shows/:id`
- **Suite category:** none
- **Pattern:** network-error
- **Detected by:** audit-pages
- **Evidence:** 2026-05-21 route-health sweep logged Supabase `406` responses on public `/shows/4584f257-19b5-4016-aae6-5e7827b769cb` at desktop and 375px from `postgrestGetShowById`.
- **User impact:** Public show detail rendered, but the background detail query generated avoidable 406 network noise that can mask real route-health failures.
- **Intent check:** Preserves the exhibitor/public browsing experience by keeping show-detail loading quiet when a detail row is not visible.
- **Fix owner:** `apps/myk9show/src/services/database/shows/reads.postgrest.ts`
- **Proof required:** Passed on 2026-05-21 with focused browser replay of `/shows/4584f257-19b5-4016-aae6-5e7827b769cb` at 1280px and 375px: both passed with no owned 4xx/5xx responses.
- **Notes:** Fixed by changing the detail lookup from `.single()` to `.maybeSingle()` while keeping the existing `PGRST116` compatibility branch for tests.

### QA-NETWORK-ERROR-003

- **Status:** fixed
- **Severity:** high
- **Role:** secretary
- **Surface:** `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx` / `/secretary/shows/:showId`
- **Suite category:** feature-audit
- **Pattern:** network-error
- **Detected by:** qa-feature
- **Evidence:** Reproduced on 2026-05-20 with `cd apps/myk9show && pnpm test:e2e:clean src/test/e2e/entities/secretaryShowWorkbenchUI.spec.ts --project=chromium --workers=1 --timeout=90000 --retries=0`. The Secretary Show Workbench rendered, but browser health captured `404 GET https://sojmvhhwsjxmfistvzbe.supabase.co/rest/v1/show_incidents?...` from the Incident Log/Incident Closeout queries. The migration file exists at `supabase/migrations/20260519163003_create_show_incidents.sql`, so the linked environment appears to be missing the table or REST exposure.
- **User impact:** Secretaries see incident-related workbench cards backed by a failing request, so show-day incident logging/closeout cannot be trusted until the table is available in the environment.
- **Intent check:** Harms the secretary target feeling of "That was easy" because a calm show-day page is quietly failing while loading incident data.
- **Fix owner:** Supabase migration/deployment for show incidents.
- **Proof required:** Passed on 2026-05-20 after applying pending migrations: `cd apps/myk9show && pnpm test:e2e:clean src/test/e2e/entities/secretaryShowWorkbenchUI.spec.ts --project=chromium --workers=1 --timeout=90000 --retries=0` (`2 passed`).
- **Notes:** Fixed by applying `supabase/migrations/20260519163003_create_show_incidents.sql` to the linked Supabase project after explicit user approval. `supabase/migrations/20260518120000_add_entry_payment_method.sql` was an unrelated pending prerequisite discovered by the dry run, so it was applied in the same approved DB push but was not the root cause of this finding.

### QA-ROLE-RLS-MISMATCH-002

- **Status:** fixed
- **Severity:** medium
- **Role:** admin
- **Surface:** `apps/myk9show/src/test/e2e/entities/showCRUD.spec.ts` / show delete feature-audit proof
- **Suite category:** feature-audit
- **Pattern:** role-rls-mismatch
- **Detected by:** qa-feature
- **Evidence:** Reproduced on 2026-05-15 with `cd apps/myk9show && pnpm test:e2e:clean src/test/e2e/entities/showCRUD.spec.ts --grep "delete a show" --project=chromium --workers=1 --timeout=90000 --retries=0`. Direct browser-context evidence showed `admin@myk9t.com` returns `is_site_admin() = true` and `is_platform_admin() = true`; `createShow` succeeds, then `deleteShow` fails with Postgres `42501 new row violates row-level security policy for table "shows"`. Follow-up evidence showed the existing `soft_delete_show` RPC rejected admin-created draft shows with `club_id = null` as `Show not found`.
- **User impact:** The feature-audit suite could not prove show soft-delete behavior. Admin-created draft shows without a club could not be cleaned up through the app-layer soft-delete path.
- **Intent check:** Restores the admin/secretary expectation that show-management actions are predictable and explainable.
- **Fix owner:** show database writes / show CRUD feature-audit setup / show RLS policy evidence.
- **Proof required:** Passed on 2026-05-15: `cd apps/myk9show && pnpm test:e2e:clean src/test/e2e/entities/showCRUD.spec.ts --grep "delete a show" --project=chromium --workers=1 --timeout=90000 --retries=0` (`1 passed`).
- **Notes:** Fixed by routing app-layer show soft delete through the existing `soft_delete_show` RPC, applying `supabase/migrations/20260515110000_fix_shows_soft_delete_rls.sql`, and applying `supabase/migrations/20260515113000_fix_soft_delete_show_null_club.sql` so site admins can soft-delete draft shows without `club_id`.

### QA-TEST-FLAKE-001

- **Status:** fixed
- **Severity:** medium
- **Role:** secretary
- **Surface:** `apps/myk9show/src/test/e2e/uat/secretary/disposable-entry.spec.ts` / `/secretary/entries/:showId`
- **Suite category:** nightly
- **Pattern:** test-flake
- **Detected by:** Playwright
- **Evidence:** 2026-05-13 Nightly command passed 24/25 active tests, then timed out in `secretary can find, assign armband, accept, and check in a disposable entry` at `expect(page.getByRole('heading', { name: 'Entry Management' })).toBeVisible`. Error context showed the Entry Management page eventually rendered with no selected show. Attachment paths: `apps/myk9show/test-results/uat-secretary-disposable-e-b1800-check-in-a-disposable-entry-chromium/error-context.md` and `apps/myk9show/test-results/uat-secretary-disposable-e-b1800-check-in-a-disposable-entry-chromium/attachments/uat-finding-f5b976e70efcece8df9f855dea9a722d482c1170.md`.
- **User impact:** Nightly cannot currently prove the disposable-entry secretary workflow end to end; if this is product behavior rather than test timing, a secretary may not land on the expected seeded show from an Entry Management deep link.
- **Intent check:** Harms the secretary target feeling of "That was easy" if the page opens without the intended show context.
- **Fix owner:** secretary Entry Management route/data selection and UAT seed/deep-link proof.
- **Proof required:** Passed focused proof on 2026-05-13: `cd apps/myk9show && pnpm test:e2e:clean src/test/e2e/uat/secretary/disposable-entry.spec.ts --project=chromium --workers=1 --timeout=90000 --retries=0` (`1 passed`). Passed promotion proof on 2026-05-13: full active Nightly command from `docs/qa/e2e-suite-map.md` with `--retries=0` (`25 passed`).
- **Notes:** Root cause was stale local replicated show data preventing `/secretary/entries/:showId` from selecting a valid deep-linked show. Fixed by falling back to server reads on missing show cache data and by resolving URL show ids directly when the selector list is stale.
