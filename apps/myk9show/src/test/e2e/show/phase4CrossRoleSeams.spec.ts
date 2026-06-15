import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { signIn } from '../uat/shared/auth';
import { TEST_USERS } from '../helpers/testUsers';
import {
  createPhase4SeamState,
  PHASE4_IDS,
  PHASE4_ROUTES,
  type Phase4SeamState,
} from '../fixtures/phase4SeamFixture';
import { installPhase4SeamRoutes, type InstalledSeamRoutes } from '../fixtures/phase4SeamRoutes';

/**
 * Suite category: feature-audit (Phase 4 cross-role seams, Dynamic QA).
 *
 * Drives the five exhibitor<->secretary seams in two browser contexts that
 * SHARE one in-memory fixture show, so role A's action becomes visible to role
 * B without any write reaching the shared Supabase project. The write-safe
 * interception harness (`installPhase4SeamRoutes`) and its state machine are
 * unit-tested in `src/test/phase4-seam/phase4SeamRoutes.test.ts`; this spec adds
 * the live latency + render evidence the audit needs.
 *
 * ── Why this spec is gated by PHASE4_SEAM_FIXTURE_READY ──────────────────────
 * The harness blocks every seam WRITE locally (proven by the unit tests). The
 * remaining gap is READS: the app loads entries/classes from the replication
 * layer (IndexedDB), not PostgREST, so the seeded `phase4-` rows do not surface
 * from a network interceptor alone. Rendering the fixture show in a live browser
 * needs ONE of:
 *   (A) seed the fixture show into IndexedDB replication stores before load, or
 *   (B) a LOCAL Supabase instance seeded with the fixture rows (the plan's
 *       documented fallback), with the dev server pointed at it.
 * Until that read strategy is chosen (Phase 5 human gate), this spec self-skips
 * rather than walk shared staging data and report false coverage. Set
 * PHASE4_SEAM_FIXTURE_READY=1 once a read strategy is wired in.
 */

const FIXTURE_READY = process.env.PHASE4_SEAM_FIXTURE_READY === '1';
const SEAM_TIMEOUT = 10_000; // Task 5: a seam that does not propagate in 10s fails.

test.describe('Phase 4 cross-role seams (fixture-backed)', () => {
  test.skip(
    !FIXTURE_READY,
    'Read strategy not wired (see header): set PHASE4_SEAM_FIXTURE_READY=1 once the fixture show is seeded into IndexedDB or a local Supabase. Write-safety is covered by the unit tests.'
  );

  let secretaryCtx: BrowserContext;
  let exhibitorCtx: BrowserContext;
  let secretaryPage: Page;
  let exhibitorPage: Page;
  let state: Phase4SeamState;
  let secretaryRoutes: InstalledSeamRoutes;
  let exhibitorRoutes: InstalledSeamRoutes;

  test.beforeEach(async ({ browser }) => {
    // One shared state instance so both contexts observe the same show (Task 4).
    state = createPhase4SeamState();

    secretaryCtx = await browser.newContext();
    exhibitorCtx = await browser.newContext();
    secretaryPage = await secretaryCtx.newPage();
    exhibitorPage = await exhibitorCtx.newPage();

    secretaryRoutes = await installPhase4SeamRoutes(secretaryPage, state);
    exhibitorRoutes = await installPhase4SeamRoutes(exhibitorPage, state);

    await signIn(
      secretaryPage,
      TEST_USERS.SECRETARY.email,
      TEST_USERS.SECRETARY.password,
      PHASE4_ROUTES.secretaryEntryManagement
    );
    await signIn(
      exhibitorPage,
      TEST_USERS.EXHIBITOR.email,
      TEST_USERS.EXHIBITOR.password,
      PHASE4_ROUTES.exhibitorMyEntries
    );

    // Each role must see the seeded show before any seam action (Task 4).
    await expect(secretaryPage.getByText(state.show.name)).toBeVisible({ timeout: SEAM_TIMEOUT });
    await expect(exhibitorPage.getByText(state.show.name)).toBeVisible({ timeout: SEAM_TIMEOUT });
  });

  test.afterEach(async () => {
    // No write may have leaked to shared Supabase from either context (Task 3).
    secretaryRoutes?.assertSafe();
    exhibitorRoutes?.assertSafe();
    await secretaryCtx?.close();
    await exhibitorCtx?.close();
  });

  test('scratch request: exhibitor requests -> secretary sees -> approve -> exhibitor confirmation', async () => {
    const start = Date.now();
    await exhibitorPage.goto(PHASE4_ROUTES.exhibitorMyEntries);
    await exhibitorPage.getByTestId(`entry-${PHASE4_IDS.entryScratch}-request-scratch`).click();
    await exhibitorPage.getByRole('button', { name: /confirm|request/i }).click();

    await secretaryPage.goto(PHASE4_ROUTES.secretaryPullManagement);
    await expect(
      secretaryPage.getByText(/scratch requested/i).first()
    ).toBeVisible({ timeout: SEAM_TIMEOUT });
    await secretaryPage.getByRole('button', { name: /approve/i }).first().click();

    await exhibitorPage.goto(PHASE4_ROUTES.exhibitorMyEntries);
    await expect(exhibitorPage.getByText(/scratched|pulled/i).first()).toBeVisible({
      timeout: SEAM_TIMEOUT,
    });
    logSeamLatency('scratch', start);
    await capture(secretaryPage, 'phase4-dynamic-scratch-secretary');
  });

  test('waitlist: secretary offers -> exhibitor accepts -> both agree on status', async () => {
    const start = Date.now();
    await secretaryPage.goto(PHASE4_ROUTES.secretaryWaitlist);
    await secretaryPage.getByRole('button', { name: /offer/i }).first().click();

    await exhibitorPage.goto(PHASE4_ROUTES.exhibitorMyEntries);
    await expect(exhibitorPage.getByText(/offered|accept/i).first()).toBeVisible({
      timeout: SEAM_TIMEOUT,
    });
    await exhibitorPage.getByRole('button', { name: /accept/i }).first().click();
    await expect(exhibitorPage.getByText(/confirmed/i).first()).toBeVisible({
      timeout: SEAM_TIMEOUT,
    });
    logSeamLatency('waitlist', start);
    await capture(exhibitorPage, 'phase4-dynamic-waitlist-exhibitor');
  });

  test('entry question: exhibitor messages -> secretary replies -> exhibitor sees reply', async () => {
    const start = Date.now();
    await exhibitorPage.goto(PHASE4_ROUTES.exhibitorShowMessages);
    await exhibitorPage.getByRole('textbox').fill('What time is my class?');
    await exhibitorPage.getByRole('button', { name: /send/i }).click();

    await secretaryPage.goto(PHASE4_ROUTES.secretaryMessages);
    await expect(secretaryPage.getByText('What time is my class?')).toBeVisible({
      timeout: SEAM_TIMEOUT,
    });
    await secretaryPage.getByRole('textbox').fill('Your class starts at 9am.');
    await secretaryPage.getByRole('button', { name: /send|reply/i }).click();

    await exhibitorPage.goto(PHASE4_ROUTES.exhibitorShowMessages);
    await expect(exhibitorPage.getByText('Your class starts at 9am.')).toBeVisible({
      timeout: SEAM_TIMEOUT,
    });
    logSeamLatency('message', start);
    await capture(exhibitorPage, 'phase4-dynamic-message-exhibitor');
  });

  test('refund: secretary refunds -> exhibitor entry status agrees', async () => {
    const start = Date.now();
    await secretaryPage.goto(PHASE4_ROUTES.secretaryEntryManagement);
    await secretaryPage.getByTestId(`entry-${PHASE4_IDS.entryWithdraw}-refund`).click();
    await secretaryPage.getByRole('button', { name: /refund/i }).last().click();

    await exhibitorPage.goto(PHASE4_ROUTES.exhibitorMyEntries);
    await expect(exhibitorPage.getByText(/refunded|withdrawn/i).first()).toBeVisible({
      timeout: SEAM_TIMEOUT,
    });
    logSeamLatency('refund', start);
    await capture(exhibitorPage, 'phase4-dynamic-refund-exhibitor');
  });

  test('results release: secretary releases -> exhibitor reveal (hidden before, visible after)', async () => {
    const start = Date.now();
    await exhibitorPage.goto(PHASE4_ROUTES.exhibitorResults);
    await expect(exhibitorPage.getByText(/no results yet/i)).toBeVisible({ timeout: SEAM_TIMEOUT });

    await secretaryPage.goto(PHASE4_ROUTES.secretaryResultsControl);
    await secretaryPage.getByRole('button', { name: /release/i }).first().click();

    await exhibitorPage.goto(PHASE4_ROUTES.exhibitorResults);
    await expect(exhibitorPage.getByText(state.classes[PHASE4_IDS.classOpen].name)).toBeVisible({
      timeout: SEAM_TIMEOUT,
    });
    logSeamLatency('results', start);
    await capture(exhibitorPage, 'phase4-dynamic-results-exhibitor');
  });
});

function logSeamLatency(seam: string, startMs: number): void {
  // Recorded for the audit's latency/state-agreement table (Task 5/6).
  console.log(`[phase4-seam] ${seam} propagation: ${Date.now() - startMs}ms`);
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `docs/audits/2026-06-ux-journeys/artifacts/${name}.png`,
    fullPage: true,
  });
}
