import { expect, test, type Page, type Route } from '@playwright/test';
import { signInAsJudge } from '../uat/shared/auth';
import { installBrowserDiagnostics } from '../shared/browserDiagnostics';
import { installSharedStagingWriteGuard } from '../helpers/sharedStagingWriteGuard';

/**
 * Suite category: feature-audit.
 *
 * MYK9-1656: scoresheet coverage ran on AKC trials only, where the class-name
 * fallback hides a missing `trial_type`, so MYK9-1574 (a UKC/ASCA trial with no
 * trial type refused every scoresheet) escaped. This opens the live scoresheet
 * for one class under every registry the app scores (AKC, UKC, ASCA), with the
 * trial type set, blank, and as a CLONED show leaves it (the clone fills a
 * missing type with the registry's own sport).
 *
 * Hermetic like the secretary fixture: the seeded Heartland show/trial reads are
 * fetched for real and only `organization` / `trial_type` are rewritten in the
 * response, so a show is one registry (as the DB enforces) and nothing is written
 * to shared staging. The shared-staging write guard stays on and strict.
 */

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const CLASS_ID = 'dec1a55e-0000-0000-0000-000000000032';
const ENTRY_ID = 'dededede-0000-0000-0000-000000000052';
const SCORE_PATH = `/at-show/${SHOW_ID}/class/${CLASS_ID}/score/${ENTRY_ID}`;

type Registry = 'AKC' | 'UKC' | 'ASCA';

/** What a clone writes for a source trial with no type: the registry's own sport. */
const CLONED_TRIAL_TYPE: Record<Registry, string> = {
  AKC: 'Scent Work',
  UKC: 'Nosework',
  ASCA: 'Scent Detection',
};

const STORED_TRIAL_TYPE: Record<Registry, string> = {
  AKC: 'scent_work',
  UKC: 'Nosework',
  ASCA: 'Scent Detection',
};

type Row = Record<string, unknown>;

function patchTrials(trials: unknown, registry: Registry, trialType: string | null): void {
  if (!Array.isArray(trials)) return;
  for (const trial of trials as Row[]) {
    trial.trial_type = trialType;
    if ('registry_id' in trial) trial.registry_id = registry;
  }
}

function patchShow(show: Row, registry: Registry, trialType: string | null): void {
  show.organization = registry;
  patchTrials(show.trials, registry, trialType);
}

async function rewrite(route: Route, patch: (row: Row) => void): Promise<void> {
  const response = await route.fetch();
  if (!response.ok() || route.request().method() !== 'GET') {
    await route.fulfill({ response });
    return;
  }
  const body: unknown = await response.json();
  if (Array.isArray(body)) (body as Row[]).forEach(patch);
  else if (body && typeof body === 'object') patch(body as Row);
  await route.fulfill({ response, json: body });
}

/** Make the seeded show a `registry` show whose trials carry `trialType`. */
async function serveAsRegistry(
  page: Page,
  registry: Registry,
  trialType: string | null
): Promise<void> {
  await page.route('**/rest/v1/shows{,?*}', route =>
    rewrite(route, show => patchShow(show, registry, trialType))
  );
  await page.route('**/rest/v1/trials{,?*}', route =>
    rewrite(route, trial => patchTrials([trial], registry, trialType))
  );
}

const saveButton = (page: Page) => page.getByRole('button', { name: /^Save$/ });
const NO_TYPE = 'This trial has no trial type set';

test.describe('At-show scoresheet by registry (MYK9-1656)', () => {
  installBrowserDiagnostics(test);

  async function open(page: Page, registry: Registry, trialType: string | null) {
    await installSharedStagingWriteGuard(page, { strictRpcWrites: true });
    await serveAsRegistry(page, registry, trialType);
    await signInAsJudge(page, SCORE_PATH);
    await expect(page).toHaveURL(new RegExp(SCORE_PATH));
  }

  for (const registry of ['AKC', 'UKC', 'ASCA'] as const) {
    test(`${registry} trial with its type set opens the live scoresheet`, async ({ page }) => {
      await open(page, registry, STORED_TRIAL_TYPE[registry]);
      await expect(saveButton(page)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(NO_TYPE)).toHaveCount(0);
    });

    test(`${registry} show cloned from one with no type opens the live scoresheet`, async ({
      page,
    }) => {
      await open(page, registry, CLONED_TRIAL_TYPE[registry]);
      await expect(saveButton(page)).toBeVisible({ timeout: 20_000 });
    });
  }

  for (const registry of ['UKC', 'ASCA'] as const) {
    for (const blank of [null, ''] as const) {
      test(`${registry} trial with a blank trial type (${JSON.stringify(blank)}) says so`, async ({
        page,
      }) => {
        await open(page, registry, blank);
        await expect(page.getByText(NO_TYPE)).toBeVisible({ timeout: 20_000 });
        // The judge cannot manage the show: told who to ask, no link to the trial page.
        await expect(page.getByText('Ask the show secretary to set the trial type.')).toBeVisible();
        await expect(saveButton(page)).toHaveCount(0);
      });
    }
  }

  test('AKC trial with a blank trial type keeps the class-name fallback', async ({ page }) => {
    await open(page, 'AKC', null);
    await expect(saveButton(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(NO_TYPE)).toHaveCount(0);
  });
});
