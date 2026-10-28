import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import {
  assertPlaywrightRunAllowed,
  signsInFixtureAccounts,
} from './src/test/productionFixtureGuard';

// Load .env.local first (gitignored), then .env — so E2E_* test creds reach the
// test process under this config too (the authed specs read them).
// MYK9-1454: the shell's own environment, before .env files; the production opt-in is read from it.
const shellEnv = { ...process.env };
loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env', override: false });
// MYK9-1454: refuse to sign fixture accounts into production unless the run opts in.
// 'own': a run that signs fixture accounts in never reuses a running server (see webServer).
assertPlaywrightRunAllowed('playwright.ci.config.ts', shellEnv, 'own');

const isA11ySmoke = process.env.PLAYWRIGHT_A11Y === 'true';
const isRegression =
  process.env.PLAYWRIGHT_REGRESSION === 'true' || process.env.PLAYWRIGHT_NIGHTLY === 'true';

// Regression: curated journey suite, run separately from the read-only health gate.
const REGRESSION_SPECS = [
  '**/uat/secretary/critical-path.spec.ts',
  '**/uat/secretary/disposable-entry.spec.ts',
  '**/uat/secretary/evidence.spec.ts',
  '**/uat/secretary/qa-regression-proof.spec.ts',
  // The payment/* specs were aspirational mock-based suites asserting features
  // that don't exist (PayPal, chargebacks, payment plans); MYK9-617 deleted
  // them. Real payment journeys are tracked in MYK9-42.
  '**/show/atShowJudgeScoring.spec.ts',
  '**/show/atShowOfflineScoring.spec.ts',
  // Offline cold boot (MYK9-200 AC 1 / MYK9-203 AC 2). Secretary-authed, so it
  // is credential-eligible for PR smoke, but it depends on the Heartland seed
  // fixture exactly as atShowOfflineScoring does — same reason, same home.
  '**/offline-cold-boot.spec.ts',
  // scoring/scoringWorkflow and show/showManagement are obsolete candidate
  // suites; current coverage lives in focused scoring and management specs
  // tracked in docs/qa/e2e-suite-map.md.
  // exhibitorSelfRegistration depends on a separately seeded show whose entry
  // window is open; the default Heartland fixture is currently closed. Keep it
  // in the maintained inventory, but not in Nightly until that fixture exists.
  //
  // handlerNameSpace.spec.ts is here because MYK9-567 is a keyboard-level bug —
  // Base UI's popover trigger swallowed the Space keydown, so a handler name
  // typed as "Mariana Alexander" was stored as "MarianaAlexander". Whether the
  // character survives a real browser's key handling is exactly the thing under
  // test, and jsdom can only approximate it, so this needs a real browser
  // somewhere in CI. Verified BOTH directions before promotion: green at head,
  // and red with the guard reverted (`Received: "Mary-JaneO'Brien"`).
  // Secretary-authed, ~13s, every cart/entry write mocked and nothing
  // submitted. Nightly rather than PR smoke on cost grounds.
  // SEED DEPENDENCY: walks LIVE_REGISTRATION_SHOW_ID (QA_REGISTRATION_SHOW_ID,
  // else the Heartland secretary show) and needs a dog whose name matches
  // "Ranger" enterable in a Container / Novice A class. It fails at dog
  // selection if that seed drifts.
  '**/registration/handlerNameSpace.spec.ts',
  // focusedClassHeaderPinned: the Overview's pinned class header (MYK9-1266) and the
  // contained pane scroll that keeps the workspace from scrolling into a blank band.
  // Layout only a real browser measures. Hermetic fixture, every write aborted.
  // Verified both directions before promotion: green at head, and red with the
  // pane scrollers' `relative` removed (1974px of outer-page overflow).
  '**/secretary/focusedClassHeaderPinned.spec.ts',
  '**/authentication-validation.spec.ts',
  '**/slice2-dog-workspace-evidence.spec.ts',
  // The former entities/entriesUI suite targets the deleted table/card
  // implementation. Current registration-cockpit and mutation coverage lives
  // in the focused UAT specs below.
  '**/uat/secretary/entry-management-cockpit.spec.ts',
  '**/secretary/show-creation-wizard.spec.ts',
  '**/browse-shows-to-details.spec.ts',
  '**/my-entries-page-ui.spec.ts',
  // Exhibitor-authed. That used to bar a spec from PR_SMOKE_SPECS outright,
  // because the smoke job only received E2E_SECRETARY_*; it now also receives
  // E2E_DEMO_EXHIBITOR_*, so exhibitor specs are eligible. This one stays
  // Nightly-only on cost grounds rather than credentials.
  '**/myEntriesZoomReflow.spec.ts',
  // Exhibitor-authed, read-only: opens the Add/Edit dog panels and asserts the
  // real accessibility tree at three viewports (MYK9-88). Nightly rather than
  // PR smoke on cost grounds — six panel opens across three viewports.
  '**/dogPanelAccessibleNames.spec.ts',
  // Secretary-authed, read-only (types into the unsaved form, never saves): rendered
  // field inset, tab-strip fit and completion-check size of the Add Dog slide-out at
  // 320/375/768/1440 (MYK9-1121). jsdom cannot compute layout.
  '**/addDogPanelGeometry.spec.ts',
  // Secretary-authed, writes nothing: the registration wizard's pinned header stays at most a
  // quarter of the viewport and a focused control is never under it, at 375/768/1024/1440
  // (MYK9-1138). jsdom cannot measure layout.
  '**/registrationWizardStickyChrome.spec.ts',
  // Secretary-authed, writes nothing (every write is blocked or answered locally): Quick Create's
  // "Use This Person", the Dogs Added row's Remove and the step footer stay inside the slide-out at
  // 320/375/768/1280 (MYK9-1137). jsdom cannot measure layout.
  '**/quickCreatePhoneGeometry.spec.ts',
  // Secretary-authed, read-only (never saves, never dismisses): the new-role
  // notice must not cover the show wizard's Next at 390/1280px (MYK9-1131).
  // It rewrites the profile read to empty onboarded_roles. jsdom cannot measure.
  '**/secretary/newRoleNoticeWizardFooter.spec.ts',
  '**/cross-role-workflows.spec.ts',
  '**/simple-connectivity.spec.ts',
  // The live-data exhibitor canary. Here it runs with
  // MYK9_PLAYWRIGHT_REGRESSION_ENABLED=true, so a seeded database missing the
  // demo exhibitor's data FAILS instead of skipping: an empty staging is an
  // operational condition, reported once a night, not on every PR.
  '**/exhibitorReadPathCanary.spec.ts',
  // Walk regression canaries (MYK9-730): one live assertion per fix the
  // secretary and exhibitor walks verified. Also launched by name in
  // scripts/qa/run-nightly-health.sh against shared staging, where missing data
  // skips; here, on the seeded database, it fails.
  '**/walkRegressionCanaries.spec.ts',
  // Admin-authed: Nightly supplies every E2E_* credential, PR smoke only gets
  // E2E_SECRETARY_*, so this cannot live in PR_SMOKE_SPECS.
  '**/admin/userRosterDrilldown.spec.ts',
  // Admin-authed for the same reason. Fixture-backed reads, so it measures a
  // constant string rather than staging's live verdict: ~15s for five cases.
  '**/admin/health-verdict-responsive.spec.ts',
  // Admin-authed for the same reason (Nightly supplies E2E_ADMIN_*, PR smoke
  // does not). MYK9-591: asserts the Theme Mode card's computed border-color
  // in a real browser (jsdom cannot compute Tailwind styles). Mutates and
  // restores the shared e2e-admin's persisted user_preferences.mode — Nightly
  // runs are serialized, so no concurrent spec observes the flipped theme.
  '**/theme-mode-selection-border.spec.ts',
  // Exhibitor-authed, read-only: opens the Edit Dog panel and reads real
  // computed style (MYK9-612) to pin the primitive's own selected-tab
  // treatment, same pattern as theme-mode-selection-border and
  // dogPanelAccessibleNames — jsdom cannot compute Tailwind styles.
  '**/tabsTriggerSelectedStyleGuard.spec.ts',
  // Admin-authed for the same reason (Nightly supplies E2E_ADMIN_*, PR smoke
  // does not). MYK9-592 round 2: rendered geometry proof that the dogs-table
  // select column renders at a fixed 40px, Name pins beside it (not under
  // it) across a horizontal scroll, and the enlarged tap-target
  // pseudo-element is actually hit-testable — none of which jsdom's
  // unit-suite coverage can see (no layout).
  '**/dogs-table-pinned-select.spec.ts',
  // Unauthenticated, no fixture dependency beyond ANY published show with a
  // class (picked at runtime via an anon Supabase read, same technique
  // monogram-sticky-cta.spec.ts uses; the isolated regression target's
  // Heartland demo show, dededede-...-010, is published with four trials of
  // classes, so it always qualifies). MYK9-633 rounds 3-5: this bar's
  // layout was fixed three times against a single status string each time,
  // and broke again under a different one every time (round 4's 852px
  // breakpoint crushed the section links under "count unavailable"; round 5
  // restructured it to be robust BY CONSTRUCTION instead). The 18-case
  // width x status-string matrix this spec runs is the only thing that
  // proves that property continues to hold — jsdom has no layout engine and
  // cannot compute real `@container` / flex geometry, so nothing in the
  // unit suite would catch a regression here. Without this in CI, an edit
  // to `.bn-subbar-*` or the measured 820px container-query threshold could
  // reopen any of rounds 3-5's bugs and every automated check would stay
  // green. Chromium only (this config runs no other project); the matrix
  // sets each case's own viewport via `page.setViewportSize`, so it does
  // not depend on which project runs it.
  '**/banner-sticky-cta.spec.ts',
  // MYK9-1065: PageHeader breadcrumb geometry at 360px on the deepest class
  // trail. Secretary-authed and read-only; finds its target live and skips as
  // data-absent (fails under MYK9_PLAYWRIGHT_REGRESSION_ENABLED) without one.
  '**/class-breadcrumb-fits.spec.ts',
  // MYK9-1192 / MYK9-1322: the exhibitor show page at 390px and the secretary's
  // Overview at 375px must not pan sideways. Read-only, against the staging demo show.
  '**/show-page-no-sideways-scroll.spec.ts',
  // MYK9-1068: known-answer checks for the shared overflow helper every
  // geometry spec imports. setContent only: no sign-in, no data, ~1s.
  '**/horizontalOverflow.selftest.spec.ts',
  // MYK9-1031 Phase 7: the Results tab secretary journey (score, verify, release, print,
  // initial) on the show-day fixture. Stateful, so it skips unless the run is the seeded
  // isolated target (MYK9_PLAYWRIGHT_REGRESSION_ENABLED=true), whose seed-demo.sql builds a
  // fresh fixture each run.
  '**/secretary/resultsTabJourney.spec.ts',
  // MYK9-971: the wait-list journey (join, offer, decline, cron expiry, mail-in head notice and its
  // dedupe). Stateful and local-only: it calls the real cron-waitlist-expiration function on the
  // isolated target's edge runtime and restores the seed's full-class fixture in afterAll.
  '**/secretary/waitlistJourney.spec.ts',
  // MYK9-1162: number-first Add Dog (an existing dog found by its number, a no-number dog entered
  // as a held entry listed under Registration number needed, kept off the run sheet, released by
  // adding its number) and the exhibitor's phone-width "number belongs to another owner" message.
  // Stateful and local-only: skips unless MYK9_PLAYWRIGHT_REGRESSION_ENABLED=true, service-role
  // setup refuses any non-local host, and its dogs and entries are removed in afterAll.
  '**/secretary/numberFirstAddDogJourney.spec.ts',
  // MYK9-1120: the only end-to-end proof of mail-in create (Add Person, Add Dog, Add New
  // Registration, Review, Complete in the one Quick Create slide-out). Every person, dog and
  // registration write is answered by the spec's own route mocks, so nothing persists and the
  // second pass after the isolated reset cannot collide with the first; the shared-staging write
  // guard is the second net. SEED DEPENDENCY: LIVE_REGISTRATION_SHOW_ID with an open entry window
  // (applyRegistrationClock pins the moment). Nightly rather than PR smoke on cost grounds.
  '**/registration/secretaryNewUsers.spec.ts',
];

// PR Smoke: stable specs — connectivity, secretary regression proof, the
// secretary critical-path UAT suite, and the exhibitor My Shows page. Verified
// green under this config before promotion (2026-07-16; My Shows 2026-08-20).
// atShowOfflineScoring stays regression-only (depends on staging seed data);
// there are no payment specs (MYK9-617 deleted them; see REGRESSION_SPECS).
//
// sign-in-fits-one-screen.spec.ts is here for the same reason one layer out:
// the sign-in card overflowed a 1440x760 laptop by 73px once Google and Apple
// were added, putting the credential field below the fold, and nothing in CI
// could see it (MYK9-430). It asserts rendered geometry, so it fails for
// whatever reason the card grows again — a taller heading, a third provider, a
// restored helper line — and any PR can regrow it, not only one touching
// sign-in. Unauthenticated and ~3s for four cases; verified green under this
// config before promotion (2026-09-06).
//
// header-wordmark-fits.spec.ts is here because the brand truncated to
// "myK9S…" on every phone width while signed in, and no check anywhere could
// see it: the header's classes were all present and correct, so a source scan
// reads clean, and the truncation only exists once the right-hand icon buttons
// are laid out beside it. It asserts rendered geometry against the wordmark's
// intrinsic width, so it fails for whatever reason the space is taken again —
// a fifth header control, a longer product name, a bigger tap target — and any
// PR can take it, not only one touching the header. Exhibitor-authed and ~20s
// for four cases; verified green under this config before promotion
// (2026-09-07).
//
// my-entries-page-ui.spec.ts is here because a PR that rewrote that page's
// entire status vocabulary (#1699) merged green while this spec was failing —
// it was Nightly-only, so nothing caught a stale assertion until the page was
// opened in a browser by hand. It is exhibitor-authed; the smoke job now
// receives E2E_DEMO_EXHIBITOR_* alongside E2E_SECRETARY_* to support it.
//
// dialogContainsLongContent.spec.ts is here because MYK9-503 shipped a fix to
// a shared primitive whose only evidence was `toHaveClass('grid-cols-[...]')`
// under jsdom -- which loads no Tailwind and performs no layout, so it passed
// whether or not the utility was emitted. This spec measures rendered
// geometry instead: it appends an unbreakable string and a `w-full` sibling as
// direct grid items of DialogContent and asserts the sibling cannot inherit
// the string's width. Verified BOTH directions before promotion: green on the
// fix, and red with the guard reverted ("a w-full child rendered 3419px inside
// a 446px dialog"). It guards every dialog carrying no local min-w-0, so any
// PR can break it, not only one touching dialog.tsx. It is parametrized over
// BOTH grid-based popup primitives (DialogContent and AlertDialogContent),
// which carry the same guard class, so dropping it from either goes red.
// Exhibitor-authed and ~14s per case; its seed-data dependency is stated in
// docs/qa/e2e-suite-map.md and surfaced in the spec's own failure messages.
// Verified green under this config before promotion (2026-09-14).
// The exhibitor-authed UI specs in this list run on hermetic fixtures
// (helpers/exhibitorFixture.ts, helpers/secretaryFixture.ts) and no longer
// read seeded staging rows; the 2026-09-20 wipe turned this gate red for
// every PR (MYK9-702). Two specs keep that honest:
// - exhibitorFixtureSmoke carries the positive control: with the profile row
//   removed the exhibitor lands on /onboarding, so the fixture is proven to
//   be what makes the converted specs pass.
// - exhibitorReadPathCanary is the one live read. Since MYK9-1449 PR smoke runs
//   it against the job's own seeded local target with
//   MYK9_PLAYWRIGHT_REGRESSION_ENABLED=true, so missing data FAILS like a read
//   that errors or does not render. (Pointed at a shared target without that
//   flag, it skips with a named annotation instead.)
const PR_SMOKE_SPECS = [
  '**/exhibitorFixtureSmoke.spec.ts',
  '**/exhibitorReadPathCanary.spec.ts',
  '**/simple-connectivity.spec.ts',
  '**/landing-lifecycle.spec.ts',
  // MYK9-1285: anonymous home page, step 6 of the story reaches the next heading at 1280 and 375.
  '**/landing-timeline-end.spec.ts',
  '**/theme-light-until-chosen.spec.ts',
  '**/uat/secretary/qa-regression-proof.spec.ts',
  '**/uat/secretary/critical-path.spec.ts',
  '**/my-entries-page-ui.spec.ts',
  '**/sign-in-fits-one-screen.spec.ts',
  '**/header-wordmark-fits.spec.ts',
  '**/dialogContainsLongContent.spec.ts',
  // MYK9-1188: a lazy route chunk that fails to load under the real service worker recovers with
  // one guarded reload. Public route, no sign-in, no database; serves dist/ from its own server.
  '**/chunkLoadRecoveryServiceWorker.spec.ts',
];

/**
 * CI E2E Test Configuration for myK9Show
 *
 * Runs E2E tests against a built preview of the app.
 * Chromium only to keep CI fast.
 *
 * Mode precedence: a11y > regression > pr-smoke.
 *
 * Run with: npx playwright test --config=playwright.ci.config.ts
 * Regression: PLAYWRIGHT_REGRESSION=true npx playwright test --config=playwright.ci.config.ts
 */
export default defineConfig({
  testDir: './src/test/e2e',
  testMatch: isA11ySmoke
    ? ['**/a11y-smoke.spec.ts']
    : isRegression
      ? REGRESSION_SPECS
      : PR_SMOKE_SPECS,
  grep: isA11ySmoke ? /has no serious\/critical violations/ : undefined,
  fullyParallel: false,
  forbidOnly: true,
  retries: 2,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report-ci', open: 'never' }],
    ['github'],
    ['list'],
    // F10: must run AFTER the html reporter writes its report, so this is a
    // reporter listed LAST -- a globalTeardown runs before reporter.onEnd.
    ['./src/test/e2e/reporters/scrubSecretsReporter.ts'],
  ],
  timeout: 60000,
  expect: {
    timeout: 15000,
  },
  use: {
    baseURL: 'http://localhost:4173',
    // Regression/nightly runs pass `--retries=0`
    // (scripts/qa/run-playwright-regression.sh), so `on-first-retry` never
    // records: there is no first retry. A failure there must carry its own
    // trace or the next morning has nothing to diagnose from.
    trace: isRegression ? 'retain-on-failure' : 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run preview',
    port: 4173,
    // MYK9-1454: never reuse a server this run did not start when it signs fixture accounts in;
    // a reused one (another worktree's preview, a perf run's) may be built against production.
    reuseExistingServer: !process.env.CI && !signsInFixtureAccounts(),
    timeout: 120000,
  },
});
