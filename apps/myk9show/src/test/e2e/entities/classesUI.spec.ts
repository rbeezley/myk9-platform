import { test, expect, Page, Locator } from '@playwright/test';
import { signInAsSecretary } from '../helpers/testUsers';

/**
 * UI test for the Classes-on-a-Trial workflow that the secretary uses.
 *
 * Covers:
 *   - "Add Classes" opens the show wizard's add-classes mode on this trial's
 *     Classes step (MYK9-899; the old slide-over panel is gone), and Back
 *     returns to the trial page.
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
 * Auth: E2E_SECRETARY_EMAIL / E2E_SECRETARY_PASSWORD (CI secrets / .env.local).
 */

test.describe.configure({ mode: 'serial' });

const TEST_SHOW_ID = '4ad95cdc-2c04-4386-8e0b-07b9111fcac3'; // Test Golden Path Show
const TEST_TRIAL_ID = '0c300700-10a6-4a80-9f82-ccd3e6d80f5c'; // Saturday Trial 1
// MYK9-1320: a manager's trial page is the show home with the trial open.
const TRIAL_URL = `/shows/${TEST_SHOW_ID}?anchor=${TEST_TRIAL_ID}`;

async function gotoTrial(page: Page) {
  await page.goto(TRIAL_URL, { waitUntil: 'networkidle' });
  // The trial heading's Add Classes link mounts once the schedule hydrates from replication.
  await expect(page.getByRole('link', { name: /^Add classes to / }).first()).toBeVisible({
    timeout: 15000,
  });
}

/**
 * MYK9-1320: a manager's class edit and delete live on the Overview class panel. Selecting a class
 * row focuses it (FocusedClassSetupActions.tsx: the "Edit class <name>" button), Edit class opens
 * the "Edit Class" panel (SetupClassDialogs.tsx -> ClassEditPanel), and Delete class is that
 * panel's footer button (EditPanelDelete.tsx:66), which opens the shared delete alertdialog.
 */
/** A class's schedule ROW, by its anchor id (CockpitTrialGroup.tsx:145 `getCockpitAnchorElementId`). */
const classRowById = (page: Page, classId: string) =>
  page.locator(`[id="cockpit-anchor-${classId}"]`);

/** The schedule row whose text matches. Trial headers carry the same id prefix but not a class name. */
const classRowByName = (page: Page, nameMatcher: RegExp) =>
  page.locator('[id^="cockpit-anchor-"]').filter({ hasText: nameMatcher }).first();

/**
 * Click the ROW's own padding (not a control inside it) so the row selects the class
 * (CockpitTrialGroup.tsx:146-148), then wait for THAT class's "Edit class <name>" button
 * (FocusedClassSetupActions.tsx:35, aria-label `Edit class ${classLabel}`).
 */
async function focusClassRow(row: Locator, editButton: Locator) {
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.click({ position: { x: 6, y: 6 } });
  await expect(editButton).toBeVisible({ timeout: 15000 });
}

async function openClassEditPanel(page: Page, editButton: Locator) {
  await editButton.click();
  const editDialog = page.getByRole('dialog', { name: 'Edit Class' });
  await expect(editDialog).toBeVisible();
  return editDialog;
}

test.describe('Classes UI — Add Classes (show wizard, add-classes mode)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test("opens the wizard on this trial's Classes step and Back returns to the trial on the show home", async ({
    page,
  }) => {
    await gotoTrial(page);

    // The trial heading's Add Classes link on the show home (MYK9-1320).
    await page
      .getByRole('link', { name: /^Add classes to / })
      .first()
      .click();

    // MYK9-899: the one class-create flow is the wizard's add-classes mode, focused on the
    // trial the secretary launched from.
    await expect(page).toHaveURL(
      new RegExp(
        `/secretary/create-show/wizard\\?showId=${TEST_SHOW_ID}&mode=add-classes&trialId=${TEST_TRIAL_ID}`
      ),
      { timeout: 15000 }
    );

    // Classes step, on this trial's tab. Show Details / Trials are not reachable in this mode.
    await expect(page.getByText(/^Select Classes for /).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('tab', { selected: true })).toContainText(/Saturday Trial 1/i);
    await expect(page.getByText(/No (active )?templates (are available|found)/i)).toHaveCount(0);

    // Back leaves the wizard for the trial page (nothing was selected, so no prompt).
    const backButtons = page.getByRole('button', { name: /^Back$/ });
    await backButtons.last().click();
    await expect(page).toHaveURL(new RegExp(`/shows/${TEST_SHOW_ID}\\?anchor=${TEST_TRIAL_ID}$`), {
      timeout: 15000,
    });
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
    const editButton = page.getByRole('button', { name: /^Edit class Container Master/i });
    await focusClassRow(classRowByName(page, /Container Master/i), editButton);
    const editDialog = await openClassEditPanel(page, editButton);

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

    // Open Delete on Container Master: the Edit Class panel's footer button.
    const editButton = page.getByRole('button', { name: /^Edit class Container Master/i });
    await focusClassRow(classRowByName(page, /Container Master/i), editButton);
    const editDialog = await openClassEditPanel(page, editButton);
    await editDialog.getByRole('button', { name: 'Delete class', exact: true }).click();

    // The shared delete dialog (CRUD standard Phase 2): honest about Undo.
    const alert = page.getByRole('alertdialog', { name: /^Delete the class / });
    await expect(alert).toBeVisible();
    await expect(alert.getByText(/You can undo this for 10 minutes/)).toBeVisible();
    await expect(alert).toHaveAccessibleName(/Container Master/i);

    // Keep it — no DELETE/PATCH/RPC should fire.
    let deleteFired = false;
    page.on('request', req => {
      if (
        (req.url().includes('/rest/v1/classes') && ['PATCH', 'DELETE'].includes(req.method())) ||
        req.url().includes('/rest/v1/rpc/soft_delete_class')
      ) {
        deleteFired = true;
      }
    });

    await alert.getByRole('button', { name: 'Keep it', exact: true }).click();
    await expect(alert).toHaveCount(0);

    // Close the panel, then the class is still on the schedule (the row, not the open panel).
    await editDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(editDialog).toHaveCount(0);
    await expect(classRowByName(page, /Container Master/i)).toBeVisible();
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

    // Drive the UI: open the show home focused on the seeded class (`focus` is the cockpit's
    // class param), then Edit class -> the panel's Delete class.
    await page.goto(`/shows/${seed.showId}?focus=${seed.classId}`, { waitUntil: 'networkidle' });
    // The shared Golden Path show holds other classes, and the cockpit silently focuses another
    // one when `focus` does not resolve. Prove the focused class IS the seeded one before the
    // destructive click: its row is on the schedule, and the URL (which the cockpit rewrites to
    // the class it really focused) still names it.
    const seededRow = classRowById(page, seed.classId);
    await expect(seededRow).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(new RegExp(`focus=${seed.classId}`));
    const editButton = page.getByRole('button', { name: /^Edit class / });
    await expect(editButton).toHaveCount(1);
    const editDialog = await openClassEditPanel(page, editButton);
    await editDialog.getByRole('button', { name: 'Delete class', exact: true }).click();

    const alert = page.getByRole('alertdialog', { name: /^Delete the class / });
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

    const confirm = alert.getByRole('button', { name: 'Delete class', exact: true });
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await writePromise;

    // The cascade should leave both the class and every seeded entry with a
    // `deleted_at` timestamp set in the same transaction.
    await expect(async () => {
      const after = await fetchSoftDeleteState(page, seed.classId, seed.entryIds);
      expect(after.classDeletedAt).not.toBeNull();
      expect(after.entryDeletedAts.length).toBe(seed.entryIds.length);
      expect(after.entryDeletedAts.every(d => d !== null)).toBe(true);
    }).toPass({ timeout: 10000 });

    // The deleted class's row is gone from the Overview (other fixture classes stay).
    await expect(classRowById(page, seed.classId)).toHaveCount(0);
  });
});
