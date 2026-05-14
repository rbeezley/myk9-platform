import { test, expect, Page } from '@playwright/test';

/**
 * UI test for the Classes-on-a-Trial workflow that the secretary uses.
 *
 * Covers:
 *   - The "Add Classes" panel loads templates filtered by show organization
 *     (regression: panel previously opened to "No templates available" because
 *     templates were not initialized, then later filtered against the wrong
 *     field).
 *   - Editing a class to assign a judge from the show's judge pool.
 *   - The delete-class confirmation dialog (entry-cascade copy + cancellation).
 *   - The delete-class cascade: confirming the dialog soft-deletes the class
 *     AND its entries through the `soft_delete_class` RPC (migration 165).
 *
 * Test data:
 *   The non-destructive tests reuse the persistent "Test Golden Path Show" →
 *   "Saturday Trial 1" fixture. The destructive cascade test seeds its own
 *   trial under the "June 2026 AKC Scent Work" show (same pattern as
 *   trialsUI.spec.ts) so it never mutates the shared fixture.
 *
 * Auth: secretary@myk9t.com / TestPass4567! (matches clubsUI.spec.ts).
 */

test.describe.configure({ mode: 'serial' });

const SECRETARY_EMAIL = 'secretary@myk9t.com';
const SECRETARY_PASSWORD = 'TestPass4567!';

const TEST_SHOW_ID = '4ad95cdc-2c04-4386-8e0b-07b9111fcac3'; // Test Golden Path Show
const TEST_TRIAL_ID = '0c300700-10a6-4a80-9f82-ccd3e6d80f5c'; // Saturday Trial 1
const TRIAL_URL = `/shows/${TEST_SHOW_ID}/trials/${TEST_TRIAL_ID}`;

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('sign-in-button').click();
  await page.waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

async function signInAsSecretary(page: Page) {
  await signIn(page, SECRETARY_EMAIL, SECRETARY_PASSWORD);
}

async function gotoTrial(page: Page) {
  await page.goto(TRIAL_URL, { waitUntil: 'networkidle' });
  // Wait until the classes table mounts (data hydrated from replication).
  await expect(page.getByRole('button', { name: 'Add Classes' })).toBeVisible({ timeout: 15000 });
}

test.describe('Classes UI — Add Classes panel', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('opens with templates loaded for the AKC show organization', async ({ page }) => {
    // Listen for the sport_templates fetch BEFORE navigating — the page-mount
    // useEffect fires the fetch as soon as the trial page loads, well before
    // the user clicks the Add Classes button.
    const templateFetch = page.waitForResponse(
      resp => resp.url().includes('/rest/v1/sport_templates') && resp.request().method() === 'GET',
      { timeout: 15000 }
    );

    await gotoTrial(page);
    await templateFetch;

    await page.getByRole('button', { name: 'Add Classes' }).click();

    // Single AKC template in the catalog → panel auto-advances to "Select
    // Classes". Pre-fix this opened to "Select Template" with a "No templates
    // available" alert; pre-second-fix it opened to "No active templates found
    // for AKC".
    await expect(page.getByRole('dialog', { name: 'Select Classes' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/No (active )?templates (are available|found)/i)).toHaveCount(0);

    // Cancel out — this test asserts the panel opens correctly, not that it
    // commits new classes.
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog', { name: 'Select Classes' })).toHaveCount(0);
  });
});

test.describe('Classes UI — Edit class judge', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('renders judge name (not UUID) when re-opening Edit on a saved class', async ({ page }) => {
    // Regression: SelectTrigger fell back to the raw judge UUID when
    // assignedJudges loaded after the form mounted. Picking a previously-saved
    // judge re-opens the panel showing "Richard Beezley", not "08a66fc8-…".
    // Setup: Container Master in this fixture has Richard Beezley assigned
    // from earlier walkthrough runs.
    await gotoTrial(page);

    const masterRow = page.getByRole('button', { name: /Container Master /i }).first();
    await expect(masterRow).toBeVisible();
    await masterRow.locator('..').getByRole('button').last().click();
    await page.getByRole('menuitem', { name: /Edit Class/i }).click();

    const editDialog = page.getByRole('dialog', { name: 'Edit Class' });
    await expect(editDialog).toBeVisible();

    // Judge combobox shows the resolved name, not the raw UUID.
    const judgeCombo = editDialog.getByRole('combobox', { name: /Judge/i });
    await expect(judgeCombo).not.toHaveText(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
    );

    await editDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(editDialog).toHaveCount(0);
  });
});

test.describe('Classes UI — Delete class confirmation', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('confirmation dialog warns and cancels without mutating data', async ({ page }) => {
    await gotoTrial(page);

    // Open Delete on Container Master.
    const masterRow = page.getByRole('button', { name: /Container Master /i }).first();
    await masterRow.locator('..').getByRole('button').last().click();
    await page.getByRole('menuitem', { name: /Delete Class/i }).click();

    const alert = page.getByRole('alertdialog', { name: 'Delete Class' });
    await expect(alert).toBeVisible();
    await expect(alert.getByText('This action cannot be undone.')).toBeVisible();
    await expect(alert.getByText(/Container Master/i)).toBeVisible();

    // Cancel — no DELETE/PATCH should fire.
    let deleteFired = false;
    page.on('request', req => {
      if (req.url().includes('/rest/v1/classes') && ['PATCH', 'DELETE'].includes(req.method())) {
        deleteFired = true;
      }
    });

    await alert.getByRole('button', { name: 'Cancel' }).click();
    await expect(alert).toHaveCount(0);

    // Class still exists in the table.
    await expect(page.getByRole('button', { name: /Container Master /i }).first()).toBeVisible();
    expect(deleteFired).toBe(false);
  });
});

// ─── Delete class cascade ─────────────────────────────────────────────────────

/** Parent show used to seed a fresh trial+class+entries triple per test run. */
const SEEDED_SHOW_ID = '4584f257-19b5-4016-aae6-5e7827b769cb'; // June 2026 AKC Scent Work

interface SeededClass {
  showId: string;
  trialId: string;
  classId: string;
  className: string;
  entryIds: string[];
}

/**
 * Seed a trial under the existing AKC seed show, with one class and two
 * entries. Mirrors the pattern in trialsUI.spec.ts so the destructive test
 * never mutates the persistent "Test Golden Path Show" fixture.
 */
async function seedClassWithEntries(page: Page, suffix: string): Promise<SeededClass> {
  await page.goto('/shows', { waitUntil: 'networkidle' });

  return await page.evaluate(
    async ({ showId, suffix }) => {
      const { supabase } = await import('/src/lib/supabase.ts');

      const trialDate = new Date();
      trialDate.setDate(trialDate.getDate() + 30);

      const { data: trial, error: trialError } = await supabase
        .from('trials')
        .insert({
          show_id: showId,
          name: `E2E Class-Delete Trial ${suffix}`,
          date: trialDate.toISOString().split('T')[0]!,
          trial_number: '9',
          event_number: `E2E-CLS-${suffix}`,
          planned_start_time: '9:00 AM',
          status: 'upcoming',
        })
        .select('id')
        .single();
      if (trialError || !trial) throw new Error(`insert trial failed: ${trialError?.message}`);

      const className = `E2E Container Novice A ${suffix}`;
      const { data: cls, error: classError } = await supabase
        .from('classes')
        .insert({
          trial_id: trial.id,
          name: className,
          element: 'Container',
          level: 'Novice',
          section: 'A',
        })
        .select('id')
        .single();
      if (classError || !cls) throw new Error(`insert class failed: ${classError?.message}`);

      const { data: entryRows, error: entryError } = await supabase
        .from('entries')
        .insert([
          {
            show_id: showId,
            trial_id: trial.id,
            class_id: cls.id,
            armband: '7001',
            entry_status: 'submitted',
          },
          {
            show_id: showId,
            trial_id: trial.id,
            class_id: cls.id,
            armband: '7002',
            entry_status: 'submitted',
          },
        ])
        .select('id');
      if (entryError || !entryRows) {
        throw new Error(`insert entries failed: ${entryError?.message}`);
      }

      return {
        showId,
        trialId: trial.id,
        classId: cls.id,
        className,
        entryIds: entryRows.map((r: { id: string }) => r.id),
      };
    },
    { showId: SEEDED_SHOW_ID, suffix }
  );
}

/**
 * Hard-delete the seeded trial as cleanup. The DB-level ON DELETE CASCADE on
 * trials sweeps the class and entries (whether or not they were soft-deleted).
 * Best-effort — never fails the test.
 */
async function cleanupSeededClass(page: Page, seed: SeededClass) {
  await page.evaluate(async ({ trialId }) => {
    try {
      const { supabase } = await import('/src/lib/supabase.ts');
      await supabase.from('trials').delete().eq('id', trialId);
    } catch {
      // best-effort
    }
  }, seed);
}

/**
 * Read soft-delete state for a class and a set of entries in one round trip.
 * Uses the maybeSingle / select-by-id pattern so we see the row even after
 * `deleted_at` is set (RLS on `classes`/`entries` does not filter soft-deleted
 * rows for an authenticated secretary).
 */
async function fetchSoftDeleteState(
  page: Page,
  classId: string,
  entryIds: string[]
): Promise<{ classDeletedAt: string | null; entryDeletedAts: Array<string | null> }> {
  return await page.evaluate(
    async ({ classId, entryIds }) => {
      const { supabase } = await import('/src/lib/supabase.ts');
      const [classRes, entryRes] = await Promise.all([
        supabase.from('classes').select('deleted_at').eq('id', classId).maybeSingle(),
        supabase.from('entries').select('id, deleted_at').in('id', entryIds),
      ]);
      const map = new Map<string, string | null>();
      for (const row of (entryRes.data ?? []) as Array<{ id: string; deleted_at: string | null }>) {
        map.set(row.id, row.deleted_at);
      }
      return {
        classDeletedAt: classRes.data?.deleted_at ?? null,
        entryDeletedAts: entryIds.map(id => map.get(id) ?? null),
      };
    },
    { classId, entryIds }
  );
}

test.describe('Classes UI — Delete class cascade', () => {
  let seed: SeededClass;

  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
    seed = await seedClassWithEntries(page, `${Date.now()}`);
  });

  test.afterEach(async ({ page }) => {
    if (seed) await cleanupSeededClass(page, seed);
  });

  test('confirming the delete soft-deletes the class and its entries', async ({ page }) => {
    // Sanity: pre-delete, neither the class nor its entries are soft-deleted.
    const before = await fetchSoftDeleteState(page, seed.classId, seed.entryIds);
    expect(before.classDeletedAt).toBeNull();
    expect(before.entryDeletedAts.every(d => d === null)).toBe(true);

    // Drive the UI: open the trial, find the seeded class row, kebab → Delete.
    await page.goto(`/shows/${seed.showId}/trials/${seed.trialId}`, { waitUntil: 'networkidle' });
    const classRow = page.getByRole('button', { name: new RegExp(seed.className, 'i') }).first();
    await expect(classRow).toBeVisible({ timeout: 15000 });
    await classRow.locator('..').getByRole('button').last().click();
    await page.getByRole('menuitem', { name: /Delete Class/i }).click();

    const alert = page.getByRole('alertdialog', { name: 'Delete Class' });
    await expect(alert).toBeVisible();

    // The user-observable contract is the cascade outcome, not the wire
    // protocol. Wait for either path to fire so the test passes whether the
    // app is on the soft_delete_class RPC (migration 165 / PR #107) or the
    // legacy two-step PATCH cascade. The DB-state assertions below are the
    // real checks.
    const writePromise = page.waitForResponse(
      resp => {
        const url = resp.url();
        const method = resp.request().method();
        if (resp.status() >= 400) return false;
        if (url.includes('/rest/v1/rpc/soft_delete_class') && method === 'POST') return true;
        if (url.includes('/rest/v1/classes') && method === 'PATCH') return true;
        return false;
      },
      { timeout: 15000 }
    );

    await alert.getByRole('button', { name: /^Delete$/ }).click();
    await writePromise;

    // The cascade should leave both the class and every seeded entry with a
    // `deleted_at` timestamp set in the same transaction.
    await expect(async () => {
      const after = await fetchSoftDeleteState(page, seed.classId, seed.entryIds);
      expect(after.classDeletedAt).not.toBeNull();
      expect(after.entryDeletedAts.length).toBe(seed.entryIds.length);
      expect(after.entryDeletedAts.every(d => d !== null)).toBe(true);
    }).toPass({ timeout: 10000 });

    // The deleted class no longer appears in the trial's class table.
    await expect(page.getByRole('button', { name: new RegExp(seed.className, 'i') })).toHaveCount(
      0
    );
  });
});
