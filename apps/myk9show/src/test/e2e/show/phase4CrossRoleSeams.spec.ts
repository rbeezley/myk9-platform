import { test, type Page } from '@playwright/test';
import { signIn } from '../uat/shared/auth';
import {
  createPhase4SeamState,
  PHASE4_IDS,
  type Phase4SeamState,
} from '../fixtures/phase4SeamFixture';
import { installPhase4SeamRoutes } from '../fixtures/phase4SeamRoutes';

/**
 * Suite category: feature-audit (Phase 4 cross-role seams, Dynamic QA).
 *
 * RENDER-ONLY walk (read strategy chosen 2026-06-23, see
 * docs/plan-phase4-seam-render-only.md). The seam transition logic + cross-role
 * state agreement are proven deterministically by the vitest suites
 * (`src/test/phase4-seam/*`); this spec adds live RENDER evidence — it drives the
 * real app, signed in as the real secretary, with the harness serving the
 * replication sync-down reads so a FABRICATED show ("Autumn Classic") renders
 * without any row existing in shared Supabase. Each seam state is pre-set in the
 * fixture, so one sync renders them all; we then screenshot each surface.
 *
 * Gated by PHASE4_SEAM_FIXTURE_READY (off in CI — flaky e2e path). Capture:
 *   PHASE4_SEAM_FIXTURE_READY=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:5191 \
 *     npx playwright test phase4CrossRoleSeams --project=chromium
 *
 * Scope: SECRETARY surfaces only. The exhibitor side ("My Entries") is
 * identity-scoped (real person id / owned dogs) and needs a real-dog bridge —
 * see docs/plan-phase4-seam-render-only.md "Live spike findings".
 */

const FIXTURE_READY = process.env.PHASE4_SEAM_FIXTURE_READY === '1';
const SECRETARY_EMAIL = process.env.E2E_SECRETARY_EMAIL ?? '';
const SECRETARY_PASSWORD = process.env.E2E_SECRETARY_PASSWORD ?? '';

// Authz RPCs are READS (the real signed-in user's real permissions) — let them
// reach staging so RBAC loads; the harness only blocks fixture WRITES.
const AUTHZ_PASSTHROUGH = [
  /rpc\/[a-z_]*permission/,
  /rpc\/[a-z_]*role/,
  /rpc\/can_manage_show/,
  /rpc\/is_show_manager/,
];

// Playwright's cwd is the app dir; the canonical audit artifacts live at repo root.
const ARTIFACT_DIR = '../../docs/audits/2026-06-ux-journeys/artifacts';

/** Pre-set every seam into a representative state so one sync renders them all. */
function seamStates(state: Phase4SeamState): Phase4SeamState {
  state.entries[PHASE4_IDS.entryScratch].entry_status = 'scratch-requested';
  state.entries[PHASE4_IDS.entryScratch].special_requests = 'Dog is unwell — please pull.';
  state.entries[PHASE4_IDS.entryQuestion].entry_status = 'scratched';
  state.entries[PHASE4_IDS.entryQuestion].check_in_status = 'pulled';
  state.entries[PHASE4_IDS.entryWithdraw].entry_status = 'withdrawn';
  state.entries[PHASE4_IDS.entryWithdraw].payment_status = 'refunded';
  state.waitlistEntries[PHASE4_IDS.waitlist].status = 'offered';
  state.waitlistEntries[PHASE4_IDS.waitlist].offered_at = '2026-09-10T12:00:00.000Z';
  state.classes[PHASE4_IDS.classOpen].results_released_at = '2026-09-12T18:00:00.000Z';
  return state;
}

async function shoot(page: Page, name: string): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1200); // let the replicated rows paint
  await page.screenshot({ path: `${ARTIFACT_DIR}/${name}.png`, fullPage: true });
}

test.describe('Phase 4 cross-role seams — render-only (secretary)', () => {
  test.skip(
    !FIXTURE_READY,
    'Render-only capture is manual: set PHASE4_SEAM_FIXTURE_READY=1 with a dev server running. CI skips it. Seam logic is proven by src/test/phase4-seam/*.'
  );
  test.skip(!SECRETARY_EMAIL || !SECRETARY_PASSWORD, 'no secretary credentials');

  test('secretary sees every seam state on the fabricated show', async ({ page }) => {
    const state = seamStates(createPhase4SeamState());
    const routes = await installPhase4SeamRoutes(page, state, {
      allowWritePaths: AUTHZ_PASSTHROUGH,
    });
    const showId = state.show.id;

    await signIn(page, SECRETARY_EMAIL, SECRETARY_PASSWORD, '/secretary');

    await page.goto(`/shows/${showId}`);
    await shoot(page, 'phase4-dynamic-show-detail');

    await page.goto(`/shows/${showId}/entry-management`);
    await shoot(page, 'phase4-dynamic-entry-management');

    await page.goto(`/shows/${showId}/entry-management?entryTab=scratches`);
    await shoot(page, 'phase4-dynamic-scratch-pull');

    await page.goto(`/shows/${showId}/results-control`);
    await shoot(page, 'phase4-dynamic-results-control');

    routes.assertSafe();
  });
});
