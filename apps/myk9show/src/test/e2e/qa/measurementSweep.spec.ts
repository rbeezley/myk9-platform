/**
 * Route-wide a11y and geometry measurement sweep.
 *
 * Suite category: qa-discovery. NOT a gate, and deliberately so.
 *
 * ## What this is for
 *
 * The impeccable page playbook is expensive: it critiques, audits, triages,
 * fixes, polishes, tests and ships one page per run, and every round through it
 * has also GENERATED work (round 3's headline finding was wrong; round 5's
 * first probe reported 1,113 defects that did not exist). Running that playbook
 * on forty routes is not forty times as useful as running it on the four that
 * carry money and trust.
 *
 * What IS cheap, and what rounds 1–4 could not do at all because no browser
 * preview existed, is measuring. This spec separates the two halves: it visits
 * every route in `measurementSweepRoutes.ts` in both themes, measures contrast,
 * touch targets, accessible names and horizontal overflow, and writes a
 * findings report. It fixes nothing and fails nothing.
 *
 * A cluster in the report is the signal worth acting on. One page with a small
 * control is a page-level nit; the same token failing on nine pages is a token
 * defect, which is what the round-5 `--muted-foreground` finding turned out to
 * be — one edit, every dark surface.
 *
 * ## Why it does not assert
 *
 * A gate needs a baseline nobody has established yet, and a gate that starts
 * red gets suppressed rather than fixed. Measure first, decide the bar from
 * real numbers, then pin the specific defects worth pinning — which is what
 * `wizardVisualQA.spec.ts` does for the two the registration wizard had.
 *
 * ## Running it
 *
 *   pnpm exec playwright test src/test/e2e/qa/measurementSweep.spec.ts \
 *     --project=chromium --reporter=list
 *
 * Output: `test-results/measurement-sweep/findings.json` and `report.md`.
 */

import { test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { measurePage, type ProbeResult } from './measurementProbe';
import {
  SWEEP_GROUPS,
  SWEEP_ROUTE_COUNT,
  resolveSweepPath,
  type SweepAuthUser,
  type SweepGroup,
} from './measurementSweepRoutes';
import { TEST_USERS, signIn } from '../helpers/testUsers';
import {
  waitForAppApiRequestsToSettle,
  watchAppApiRequests,
  type AppApiRequestTracker,
} from '../../harness/appApiRequestTracker';
import { LIVE_SECRETARY_SHOW_ID, LIVE_REGISTRATION_SHOW_ID } from '../uat/shared/seededShows';
import { renderSweepReport, type RouteMeasurement } from './measurementSweepReport';

test.describe.configure({ mode: 'serial' });
test.setTimeout(600_000);

const PATH_PARAMS = {
  registrationShowId: LIVE_REGISTRATION_SHOW_ID,
  secretaryShowId: LIVE_SECRETARY_SHOW_ID,
};

const THEMES = ['light', 'dark'] as const;
const FINDINGS_PER_CATEGORY = 12;
const SETTLE_MS = 1200;
const GOTO_TIMEOUT_MS = 20_000;
const OUT_DIR = resolve(process.cwd(), 'test-results/measurement-sweep');

/** Accumulated across every test in the file; written once in afterAll. */
const measurements: RouteMeasurement[] = [];

function credentialsFor(authUser: SweepAuthUser) {
  if (authUser === 'PUBLIC') return null;
  return TEST_USERS[authUser];
}

async function applyTheme(page: Page, theme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript(colorScheme => {
    localStorage.setItem('myK9Q_settings', JSON.stringify({ theme: colorScheme }));
  }, theme);
}

/**
 * Readiness, not a fixed sleep.
 *
 * The first draft used route-health's gate — body text > 20 chars, then a fixed
 * settle — and it is far too weak here. The registration wizard measured 1,291
 * text nodes on one run and 16 on the next: once fully painted mid-fade-in,
 * once still a shell. The first produced 1,277 "contrast defects" that were
 * nothing but entrance-animation opacity. A weak readiness gate does not make a
 * measurement noisy, it makes it fictional.
 *
 * So: wait for the app's own API reads to go idle, then for the text content to
 * stop changing between samples, then for running animations to finish. Each
 * wait is capped — a spinner animates forever, and a page that never settles
 * should still be measured and flagged, not hang the sweep.
 */
async function visit(page: Page, path: string, tracker: AppApiRequestTracker) {
  await page.goto(path, { waitUntil: 'commit', timeout: GOTO_TIMEOUT_MS });
  await page.waitForLoadState('domcontentloaded', { timeout: GOTO_TIMEOUT_MS }).catch(() => {});
  await page
    .waitForFunction(() => document.body.innerText.trim().length > 20, null, {
      timeout: GOTO_TIMEOUT_MS,
    })
    .catch(() => {});

  await waitForAppApiRequestsToSettle(page, tracker, { timeoutMs: 10_000 }).catch(() => {});

  // Content stability: two consecutive identical text lengths, 400ms apart.
  let previous = -1;
  for (let i = 0; i < 12; i++) {
    const length = await page.evaluate(() => document.body.innerText.trim().length);
    if (length === previous && length > 20) break;
    previous = length;
    await page.waitForTimeout(400);
  }

  // Entrance animations. `finished` rejects when an animation is cancelled, and
  // never resolves for an infinite spinner, so both are raced against a cap.
  await page
    .evaluate(
      () =>
        new Promise<void>(resolve => {
          const running = document
            .getAnimations()
            .filter(a => a.playState === 'running')
            .map(a => a.finished.catch(() => undefined));
          Promise.all(running).then(() => resolve());
          setTimeout(resolve, 1500);
        })
    )
    .catch(() => {});

  await page.waitForTimeout(SETTLE_MS);
}

async function sweepGroup(page: Page, group: SweepGroup, theme: 'light' | 'dark') {
  await applyTheme(page, theme);
  const tracker = watchAppApiRequests(page);

  const user = credentialsFor(group.authUser);
  if (user) {
    const landing = group.routes.find(r => r.landing) ?? group.routes[0];
    try {
      await signIn(page, user.email, user.password, resolveSweepPath(landing.path, PATH_PARAMS));
    } catch (caught) {
      // A sign-in failure used to throw before the route loop, so the whole
      // group vanished from `measurements` while the report went on advertising
      // the full static route count — a credential problem rendered as clean
      // coverage. That is precisely the failure this file's own exclusion list
      // exists to prevent, so record every route in the group as excluded and
      // let the run continue (Codex, this PR).
      const reason = caught instanceof Error ? caught.message : String(caught);
      for (const route of group.routes) {
        measurements.push({
          id: `${group.id}/${route.id}`,
          group: group.id,
          route: route.id,
          path: resolveSweepPath(route.path, PATH_PARAMS),
          landedPath: new URL(page.url()).pathname,
          theme,
          reached: false,
          error: `sign-in failed for ${group.authUser}: ${reason}`,
          probe: null,
        });
      }
      // The console IS the live progress view for a findings run.
      console.log(`[sweep] ${theme.padEnd(5)} ${group.id} SIGN-IN FAILED: ${reason}`);
      return;
    }
  }

  for (const route of group.routes) {
    const path = resolveSweepPath(route.path, PATH_PARAMS);
    const id = `${group.id}/${route.id}`;

    let probe: ProbeResult | null = null;
    let error: string | null = null;
    try {
      await visit(page, path, tracker);
      probe = await page.evaluate(measurePage, FINDINGS_PER_CATEGORY);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }

    const landedPath = new URL(page.url()).pathname;
    measurements.push({
      id,
      group: group.id,
      route: route.id,
      path,
      landedPath,
      theme,
      // A route that bounced to sign-in measures the sign-in page. Recording
      // the landed path lets the report drop those rather than attribute
      // another page's findings to a route nobody reached.
      //
      // Exact match, ignoring a trailing slash. A `startsWith` prefix test
      // accepted any CHILD route as a successful measurement of its parent —
      // and this table sweeps several parent/child pairs, so a redirect from
      // `/shows/:id` into `/shows/:id/register` would have filed the wizard's
      // findings under the show-detail row while the wizard's own row measured
      // it again (Codex, this PR). Anything that normalises elsewhere now shows
      // up in the exclusion table with the path it actually landed on, which is
      // the more useful answer anyway.
      reached: landedPath.replace(/\/$/, '') === path.replace(/\/$/, ''),
      error,
      probe,
    });

    const summary = probe
      ? `contrast=${probe.totals.contrast} targets=${probe.totals.targets} names=${probe.totals.names} measured=${probe.measured} unmeasurable=${probe.unmeasurable} sanity=${probe.sanity.blackOnWhite}/${probe.sanity.whiteOnWhite}/${probe.sanity.greyOnWhite}/${probe.sanity.stretchedLink}px`
      : `error=${error}`;
    // The console IS the live progress view for a findings run.
    console.log(`[sweep] ${theme.padEnd(5)} ${id.padEnd(34)} ${summary}`);
  }
}

/**
 * Opt-in, and enforced rather than merely documented.
 *
 * `playwright.config.ts` sets `testDir: './src/test/e2e'` and matches every
 * spec beneath it, so describing this file as "run it deliberately" in prose
 * changes nothing — a plain `pnpm test:e2e` would pick it up and gain roughly
 * 15 minutes plus a dependency on live seeded data and four sets of
 * credentials, none of which the rest of that suite needs (Codex, this PR).
 *
 * An env gate is the smallest thing that makes the documented intent true. It
 * is deliberately not a `.skip` on a condition the CI config might satisfy by
 * accident: nothing in this repo sets this variable except the commands in
 * `docs/qa/e2e-suite-map.md`.
 */
const SWEEP_ENABLED = process.env.MYK9_MEASUREMENT_SWEEP === '1';

for (const group of SWEEP_GROUPS) {
  for (const theme of THEMES) {
    test(`measure ${group.id} routes (${theme})`, async ({ page }) => {
      test.skip(
        !SWEEP_ENABLED,
        'Measurement sweep is opt-in: set MYK9_MEASUREMENT_SWEEP=1 to run it'
      );
      const user = credentialsFor(group.authUser);
      if (user && (!user.email || !user.password)) {
        test.skip(true, `${group.authUser} credentials absent — group not measured`);
      }
      await sweepGroup(page, group, theme);
    });
  }
}

test.afterAll(() => {
  // Never overwrite a real report with an empty one. When every group skipped,
  // `measurements` is [] and rendering it would replace the previous run's
  // findings with a clean-looking zero-coverage table — a file that reads like
  // a result and is the absence of one.
  if (!measurements.length) return;

  mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = resolve(OUT_DIR, 'findings.json');
  const reportPath = resolve(OUT_DIR, 'report.md');
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify({ routeCount: SWEEP_ROUTE_COUNT, measurements }, null, 2));
  writeFileSync(reportPath, renderSweepReport(measurements, SWEEP_ROUTE_COUNT));
  // Point the operator at the artifact.
  console.log(`\n[sweep] wrote ${reportPath}`);
});
