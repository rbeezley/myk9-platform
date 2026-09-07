import { expect, test, type Page } from '@playwright/test';
import { signInAsAdmin } from '../helpers/testUsers';

/**
 * MYK9-434. At 768x1024 the manager sidebar holds 240px of the viewport, so the
 * verdict card's real content column is ~420px — but the header used to split on
 * `sm:flex-row`, a VIEWPORT breakpoint, and handed the fixed 250px counter block
 * a majority of that column. The headline collapsed to a 151px, six-line ribbon
 * with the explanation stacked under it in the same gutter.
 *
 * These assertions are geometric on purpose. The old layout had ZERO document
 * overflow at every width, so an overflow-only check passes on the defect; the
 * only thing that separates the two layouts is how wide the prose actually got
 * and how many lines it took. The reads are fixture-backed so the measured
 * string is a constant rather than whatever staging's live verdict happens to
 * be — the sign-in and the site-admin route guard are still real.
 */

const HEADLINE = '[data-testid="health-verdict-headline"]';

const WIDTHS = [
  // The regression width: sidebar present, ~420px of content column.
  { id: 'tablet', width: 768, height: 1024 },
  // Controls from the issue — these were already correct and must stay so.
  { id: 'laptop', width: 1024, height: 768 },
  { id: 'desktop', width: 1440, height: 900 },
] as const;

/** Every verdict branch named in the acceptance criteria, longest first. */
const VERDICTS = [
  {
    id: 'unknown-alerts',
    // 53 characters — the longest headline the board can produce.
    headline: 'Nothing is failing, but the alerts list is unavailable',
    checks: [ok('migrations'), ok('edge-fns')],
    /** `alertsFail` drives the alerts query to error, which is the branch that
     * refuses to collapse an unanswered alerts read into an all-clear. */
    alertsFail: true,
    alerts: [],
  },
  {
    id: 'alert-aware',
    headline: 'Nothing is failing, but 1 alert needs review',
    checks: [ok('migrations'), ok('edge-fns')],
    alertsFail: false,
    alerts: [alert('error')],
  },
  {
    id: 'failing',
    headline: 'Three checks are failing',
    checks: [fail('migrations'), fail('edge-fns'), fail('anon_grants'), ok('applied_acl_grants')],
    alertsFail: false,
    alerts: [],
  },
  {
    id: 'healthy',
    headline: "Everything's running",
    checks: [ok('migrations'), ok('edge-fns')],
    alertsFail: false,
    alerts: [],
  },
] as const;

function ok(key: string) {
  return { key, label: `Check ${key}`, status: 'ok', detail: 'agrees', verification: 'proven' };
}

function fail(key: string) {
  return {
    key,
    label: `Check ${key}`,
    status: 'fail',
    detail: 'drifted',
    verification: 'proven',
  };
}

function alert(severity: string) {
  return {
    id: `e2e-health-alert-${severity}`,
    source: 'e2e-fixture',
    severity,
    title: 'Fixture alert',
    detail: 'Fixture alert for responsive geometry only.',
    dedupe_key: `e2e-health-alert-${severity}`,
    resolved_at: null,
    resolved_by: null,
  };
}

function jsonResponse(body: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    headers: { 'content-range': '0-0/1' },
    body: JSON.stringify(body),
  };
}

async function mockHealthReads(page: Page, verdict: (typeof VERDICTS)[number]) {
  const nowIso = new Date().toISOString();
  await page.route('**/rest/v1/system_health_snapshots**', route =>
    route.fulfill(
      jsonResponse([
        {
          id: 'e2e-health-verdict-snapshot',
          created_at: nowIso,
          source: 'daily-health-check',
          overall_status: verdict.checks.some(c => c.status === 'fail') ? 'fail' : 'ok',
          checks: verdict.checks.map(c => ({ ...c, checked_at: nowIso })),
          run_duration_ms: 1500,
        },
      ])
    )
  );
  await page.route('**/rest/v1/operator_alerts**', route =>
    verdict.alertsFail
      ? route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'fixture: alerts unavailable' }),
        })
      : route.fulfill(jsonResponse(verdict.alerts.map(a => ({ ...a, created_at: nowIso }))))
  );
}

/** The narrowest column the headline may be given, matching the `basis-[320px]`
 * that triggers the wrap. Below this the 32px type breaks into a ribbon. */
const MIN_PROSE_WIDTH = 320;

interface VerdictGeometry {
  width: number;
  lines: number;
  headerWidth: number;
  explanationWidth: number;
  chipsWidth: number;
  /** True when the counters wrapped onto their own line below the prose. */
  chipsBelowProse: boolean;
  documentOverflow: number;
  cardOverflow: number;
}

async function measure(page: Page): Promise<VerdictGeometry> {
  return page.evaluate(selector => {
    const headline = document.querySelector(selector) as HTMLElement;
    const header = document.querySelector('[data-testid="health-verdict-header"]') as HTMLElement;
    const explanation = document.querySelector(
      '[data-testid="health-verdict-explanation"]'
    ) as HTMLElement;
    const chips = document.querySelector('[data-testid="health-verdict-chips"]') as HTMLElement;
    const card = header.closest('section') as HTMLElement;
    const headlineBox = headline.getBoundingClientRect();
    const chipsBox = chips.getBoundingClientRect();
    return {
      width: headlineBox.width,
      lines: Math.round(headlineBox.height / parseFloat(getComputedStyle(headline).lineHeight)),
      headerWidth: header.getBoundingClientRect().width,
      explanationWidth: explanation.getBoundingClientRect().width,
      chipsWidth: chipsBox.width,
      chipsBelowProse: chipsBox.top >= headlineBox.bottom,
      documentOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      cardOverflow: Math.max(0, card.scrollWidth - card.clientWidth),
    };
  }, HEADLINE);
}

/**
 * The invariants, at every width and for every verdict.
 *
 * The load-bearing one is `width >= chipsWidth`: this issue is literally
 * "counters squeeze the headline", and the broken layout gave the prose 151px
 * against the counter block's 250px. Stating it as a ratio of the header does
 * not work — at 1024 the counters legitimately sit beside the text and take
 * their 250px of a 692px row, so any single ratio either passes the tablet
 * defect or fails the desktop control. Comparing the two siblings holds in both
 * layouts, and `MIN_PROSE_WIDTH` stops it being satisfied from the wrong end by
 * shrinking the counters instead of widening the prose.
 */
function assertGlanceable(g: VerdictGeometry, at: string) {
  expect(g.lines, `${at}: headline line count (width ${g.width})`).toBeLessThanOrEqual(3);
  expect(g.width, `${at}: headline ${g.width} vs counters ${g.chipsWidth}`).toBeGreaterThanOrEqual(
    g.chipsWidth
  );
  expect(g.width, `${at}: headline width`).toBeGreaterThanOrEqual(MIN_PROSE_WIDTH);
  expect(g.explanationWidth, `${at}: explanation width`).toBeGreaterThanOrEqual(MIN_PROSE_WIDTH);
  expect(g.documentOverflow, `${at}: document overflow`).toBe(0);
  expect(g.cardOverflow, `${at}: verdict card overflow`).toBe(0);
}

test.describe('admin health verdict adapts to its available width', () => {
  test.setTimeout(120_000);

  for (const verdict of VERDICTS) {
    test(`${verdict.id} verdict stays glanceable at every audited width`, async ({
      page,
    }, testInfo) => {
      await mockHealthReads(page, verdict);
      await signInAsAdmin(page, '/admin/health');

      const headline = page.getByTestId('health-verdict-headline');
      await expect(headline).toHaveText(verdict.headline);

      for (const viewport of WIDTHS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        // The headline text is the precondition that makes the numbers below
        // mean anything: measuring a loading skeleton would pass trivially.
        await expect(headline).toHaveText(verdict.headline);

        const g = await measure(page);
        const at = `${verdict.id} @ ${viewport.id}`;
        assertGlanceable(g, at);

        // Which layout each width is supposed to land in. Without this the
        // suite would accept a card that stacks at 1440 too — readable, but a
        // regression of the desktop control the issue measured as correct.
        expect(g.chipsBelowProse, `${at}: counters wrapped below the prose`).toBe(
          viewport.width === 768
        );

        // The 32px type is part of the contract — shrinking it would satisfy
        // the line count while making the verdict harder to read, not easier.
        await expect(headline).toHaveCSS('font-size', '32px');

        // Counts stay visible and labelled at every width — reflowing them
        // must not mean dropping them.
        for (const label of ['failing', 'unverified', 'passing']) {
          await expect(
            page.getByTestId('health-verdict-chips').getByText(label, { exact: true }),
            `${at}: ${label} count`
          ).toBeVisible();
        }

        await page.screenshot({
          path: testInfo.outputPath(`health-verdict-${verdict.id}-${viewport.id}.png`),
        });
      }
    });
  }

  test('longest verdict holds its layout in dark mode', async ({ page }, testInfo) => {
    const verdict = VERDICTS[0];
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => {
      localStorage.setItem('myK9Q_settings', JSON.stringify({ theme: 'dark' }));
    });
    await mockHealthReads(page, verdict);
    await signInAsAdmin(page, '/admin/health');

    const headline = page.getByTestId('health-verdict-headline');
    await expect(headline).toHaveText(verdict.headline);

    for (const viewport of WIDTHS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await expect(headline).toHaveText(verdict.headline);
      const g = await measure(page);
      assertGlanceable(g, `dark @ ${viewport.id}`);
      await page.screenshot({
        path: testInfo.outputPath(`health-verdict-dark-${viewport.id}.png`),
      });
    }
  });
});
