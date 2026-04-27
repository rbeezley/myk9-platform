import { test, expect, Page } from '@playwright/test';

/**
 * UI tests for the Trials feature (secretary role).
 *
 * Walks the secretary's trial-management flows on the Trial Details page:
 *   - Edit trial via the TrialEditPanel
 *   - Delete trial via the StandardDialog confirmation
 *       * Verifies the warning text explicitly mentions classes & entries
 *         (the delete cascades through the DB ON DELETE CASCADE chain on
 *         classes, entries, promo_codes, and pipeline tables).
 *       * Verifies the trial, its classes, and its entries are actually gone
 *         from the DB after confirming.
 *
 * Strategy:
 *   - Each test seeds its own show + trial (+ classes + entries for delete) via
 *     direct DB queries through page.evaluate(), then drives the UI from the
 *     trial details page. Cleanup runs in afterEach to leave the DB tidy even
 *     if the UI flow aborts mid-test.
 *
 * Auth: secretary@myk9t.com / testpass123 (matches clubsUI / dogsUI / peopleUI).
 *
 * The Add Trial flow goes through the existing show-creation wizard at
 * `?mode=add-trials`, which is covered by `showWizardUI.spec.ts`. That test
 * verifies the wizard lands on the right step with the show preloaded; we
 * don't duplicate it here.
 */

test.describe.configure({ mode: 'serial' });

const SECRETARY_EMAIL = 'secretary@myk9t.com';
const SECRETARY_PASSWORD = 'testpass123';

const RUN_ID = Date.now();

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('sign-in-button').click();
  await page.waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

async function signInAsSecretary(page: Page) {
  return signIn(page, SECRETARY_EMAIL, SECRETARY_PASSWORD);
}

interface SeededTrial {
  showId: string;
  trialId: string;
  classIds: string[];
  entryIds: string[];
}

/** ID of the seeded "June 2026 AKC Scent Work" show used as the parent for our test trials. */
const SEEDED_SHOW_ID = '4584f257-19b5-4016-aae6-5e7827b769cb';

/**
 * Seed a trial under the existing seeded show via direct Supabase inserts.
 * The `withChildren` flag also inserts two classes and two entries so the
 * cascade delete has something to verify.
 */
async function seedTrial(
  page: Page,
  opts: { withChildren: boolean; nameSuffix: string }
): Promise<SeededTrial> {
  // Already signed in as secretary; navigate to a benign route first so the
  // app code (and Supabase client) is initialized in window context.
  await page.goto('/shows', { waitUntil: 'networkidle' });

  return await page.evaluate(
    async ({ withChildren, nameSuffix, showId }) => {
      const { supabase } = await import('/src/lib/supabase.ts');

      const trialDate = new Date();
      trialDate.setDate(trialDate.getDate() + 30);

      const { data: trial, error: trialError } = await supabase
        .from('trials')
        .insert({
          show_id: showId,
          name: `E2E Trial ${nameSuffix}`,
          date: trialDate.toISOString().split('T')[0]!,
          trial_number: '9',
          event_number: `E2E-${nameSuffix}`,
          planned_start_time: '9:00 AM',
          status: 'upcoming',
        })
        .select('id')
        .single();
      if (trialError || !trial) throw new Error(`insert trial failed: ${trialError?.message}`);

      const classIds: string[] = [];
      const entryIds: string[] = [];

      if (withChildren) {
        const { data: classRows, error: classError } = await supabase
          .from('classes')
          .insert([
            {
              trial_id: trial.id,
              name: `E2E Container Novice A ${nameSuffix}`,
              element: 'Container',
              level: 'Novice',
              section: 'A',
            },
            {
              trial_id: trial.id,
              name: `E2E Interior Novice A ${nameSuffix}`,
              element: 'Interior',
              level: 'Novice',
              section: 'A',
            },
          ])
          .select('id');
        if (classError || !classRows) {
          throw new Error(`insert classes failed: ${classError?.message}`);
        }
        classIds.push(...classRows.map((r: { id: string }) => r.id));

        const { data: entryRows, error: entryError } = await supabase
          .from('entries')
          .insert([
            {
              show_id: showId,
              trial_id: trial.id,
              class_id: classIds[0],
              armband: '9001',
              entry_status: 'submitted',
            },
            {
              show_id: showId,
              trial_id: trial.id,
              class_id: classIds[0],
              armband: '9002',
              entry_status: 'submitted',
            },
          ])
          .select('id');
        if (entryError || !entryRows) {
          throw new Error(`insert entries failed: ${entryError?.message}`);
        }
        entryIds.push(...entryRows.map((r: { id: string }) => r.id));
      }

      return {
        showId,
        trialId: trial.id,
        classIds,
        entryIds,
      };
    },
    { ...opts, showId: SEEDED_SHOW_ID }
  );
}

/**
 * Best-effort cleanup. The trial cascade delete sweeps classes/entries via the
 * DB foreign-key chain, so we only need to delete the trial. We deliberately do
 * NOT delete the parent show — it's a shared seed used by other tests.
 */
async function cleanupSeed(page: Page, seed: SeededTrial) {
  await page.evaluate(async ({ trialId }) => {
    try {
      const { supabase } = await import('/src/lib/supabase.ts');
      await supabase.from('trials').delete().eq('id', trialId);
    } catch {
      // Swallow — cleanup is best-effort.
    }
  }, seed);
}

async function fetchTrialChildCounts(
  page: Page,
  trialId: string
): Promise<{ trial: number; classes: number; entries: number }> {
  return await page.evaluate(async tid => {
    const { supabase } = await import('/src/lib/supabase.ts');
    const [trialRes, classRes, entryRes] = await Promise.all([
      supabase.from('trials').select('id', { count: 'exact', head: true }).eq('id', tid),
      supabase.from('classes').select('id', { count: 'exact', head: true }).eq('trial_id', tid),
      supabase.from('entries').select('id', { count: 'exact', head: true }).eq('trial_id', tid),
    ]);
    return {
      trial: trialRes.count ?? 0,
      classes: classRes.count ?? 0,
      entries: entryRes.count ?? 0,
    };
  }, trialId);
}

// ─── Edit Trial ───────────────────────────────────────────────────────────────

test.describe('Trial Details — Edit', () => {
  let seed: SeededTrial;

  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
    seed = await seedTrial(page, { withChildren: false, nameSuffix: `edit-${RUN_ID}` });
  });

  test.afterEach(async ({ page }) => {
    if (seed) await cleanupSeed(page, seed);
  });

  test('renames a trial via the edit panel and persists the change', async ({ page }) => {
    await page.goto(`/shows/${seed.showId}/trials/${seed.trialId}`);
    await page.waitForLoadState('networkidle');

    // The DetailHero "Edit" button opens the TrialEditPanel.
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByText('Edit Trial', { exact: false })).toBeVisible();

    const newName = `E2E Trial Renamed ${RUN_ID}`;
    const nameField = page.getByRole('textbox', { name: /Trial Name|^Name/i }).first();
    await nameField.fill(newName);

    const updateResponsePromise = page.waitForResponse(
      resp =>
        resp.url().includes('/rest/v1/trials') &&
        resp.request().method() === 'PATCH' &&
        resp.status() < 400,
      { timeout: 15000 }
    );

    await page.getByRole('button', { name: /Save|Update/i }).click();
    await updateResponsePromise;

    // Verify the rename actually persisted to the DB. The trial detail page
    // doesn't render `trials.name` directly (it shows `type` / `trial_number`
    // in the hero), so we read the DB row to confirm the PATCH wrote the
    // new value.
    const persistedName = await page.evaluate(async tid => {
      const { supabase } = await import('/src/lib/supabase.ts');
      const { data } = await supabase.from('trials').select('name').eq('id', tid).single();
      return data?.name;
    }, seed.trialId);
    expect(persistedName).toBe(newName);
  });
});

// ─── Delete Trial — warning copy + cascade ────────────────────────────────────

test.describe('Trial Details — Delete', () => {
  let seed: SeededTrial;

  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
    seed = await seedTrial(page, { withChildren: true, nameSuffix: `delete-${RUN_ID}` });
  });

  test.afterEach(async ({ page }) => {
    if (seed) await cleanupSeed(page, seed);
  });

  test('confirmation dialog warns that classes and entries will also be deleted', async ({
    page,
  }) => {
    await page.goto(`/shows/${seed.showId}/trials/${seed.trialId}`);
    await page.waitForLoadState('networkidle');

    // Open the three-dot menu in the hero, then "Delete Trial".
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    await page.getByRole('menuitem', { name: /Delete Trial/i }).click();

    const dialog = page.getByRole('dialog', { name: 'Delete Trial' });
    await expect(dialog).toBeVisible();

    // The user's request: warning copy must mention classes and entries.
    await expect(dialog).toContainText(/classes/i);
    await expect(dialog).toContainText(/entries/i);
    await expect(dialog).toContainText(/cannot be undone/i);

    // Cancel doesn't delete — sanity check before running the destructive path.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();

    const beforeCounts = await fetchTrialChildCounts(page, seed.trialId);
    expect(beforeCounts.trial).toBe(1);
    expect(beforeCounts.classes).toBe(seed.classIds.length);
    expect(beforeCounts.entries).toBe(seed.entryIds.length);
  });

  test('deletes the trial and cascades to classes and entries', async ({ page }) => {
    await page.goto(`/shows/${seed.showId}/trials/${seed.trialId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    await page.getByRole('menuitem', { name: /Delete Trial/i }).click();

    const dialog = page.getByRole('dialog', { name: 'Delete Trial' });
    await expect(dialog).toBeVisible();

    // Wait for the DELETE roundtrip on /rest/v1/trials before we expect
    // navigation off the trial page.
    const deleteResponsePromise = page.waitForResponse(
      resp =>
        resp.url().includes('/rest/v1/trials') &&
        resp.request().method() === 'DELETE' &&
        resp.status() < 400,
      { timeout: 15000 }
    );

    await dialog.getByRole('button', { name: /Delete/i }).click();
    await deleteResponsePromise;

    // After the delete, the page should redirect off the trial detail URL
    // (back to the parent show or shows list).
    await page.waitForURL(url => !url.pathname.includes(`/trials/${seed.trialId}`), {
      timeout: 15000,
    });

    // The cascade chain should have removed every child row.
    await expect(async () => {
      const counts = await fetchTrialChildCounts(page, seed.trialId);
      expect(counts.trial).toBe(0);
      expect(counts.classes).toBe(0);
      expect(counts.entries).toBe(0);
    }).toPass({ timeout: 10000 });
  });
});
