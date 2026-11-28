import { expect, test, type Page } from '@playwright/test';
import { signInAsSecretary } from '../helpers/testUsers';
import {
  cleanupDisposableEntry,
  getIsolatedAdminClient,
  isIsolatedTarget,
  seedDisposableEntry,
  type DisposableEntry,
} from '../helpers/isolatedFixtures';

/**
 * Suite category: regression (isolated only).
 *
 * MYK9-2494 (the verifier gap left by MYK9-2477). A dog moved from Section A to Section B of a
 * combined A & B class must read, in Ringside's combined list, as ONE live entry in the run list
 * plus ONE "Moved to ..." row under "Not running". Before MYK9-2477 a move that was undone and made
 * again left a soft-deleted Section B entry in the replica, and the dog showed twice.
 *
 * Driven through the real secretary path: Show Desk row menu, Change class, then "Move back to"
 * (the undo) and Change class again. The adapter shape is covered by
 * `atShowDataAdapter.undoneMove.test.ts`; this is the browser check on the rendered list.
 *
 * Fixture: disposable, open Buried Novice A and B classes in one trial (the seed has no open A/B
 * pair) and a disposable dog entered in A. Both are deleted afterwards.
 * It writes real rows, so it skips unless the target is the isolated stack.
 */

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
// The template entry only lends its trial, handler and fee: its seeded class is finalized
// (completed, results released), so it is never a move source and is never cloned.
const TRIAL_ID = 'dededede-0000-0000-0000-000000000021';
const REPLICATION_DB_NAME = 'myK9_Replication';
const TEMPLATE_ENTRY_ID = 'dededede-0000-0000-0000-000000000051';
const CLASS_A_LABEL = 'Buried Novice A';
const CLASS_B_LABEL = 'Buried Novice B';

test.describe.configure({ mode: 'serial' });
test.skip(!isIsolatedTarget(), 'writes real rows: isolated Supabase target only');

let seed: DisposableEntry | null = null;
let classAId: string | null = null;
let classBId: string | null = null;

/** Two open, empty classes with explicit fields; never a clone of the finalized results fixture. */
async function seedSections(): Promise<{ a: string; b: string }> {
  const client = getIsolatedAdminClient();
  const row = (section: 'A' | 'B') => ({
    trial_id: TRIAL_ID,
    name: `Buried Novice ${section}`,
    element: 'Buried',
    level: 'Novice',
    section,
    entry_fee: 30,
    status: 'upcoming',
    time_limit_seconds: 120,
    num_hides: 1,
    num_areas: 1,
    has_blank: false,
    timer_mode: 'single',
    hides_known: true,
    display_order: section === 'A' ? 91 : 92,
  });
  const { data, error } = await client
    .from('classes')
    .insert([row('A'), row('B')])
    .select('id, section');
  if (error || !data || data.length !== 2) {
    throw new Error(`Could not seed Buried Novice A and B: ${error?.message ?? 'missing classes'}`);
  }
  const idFor = (section: string) => data.find(c => c.section === section)?.id as string;
  return { a: idFor('A'), b: idFor('B') };
}

test.beforeEach(async () => {
  const classes = await seedSections();
  classAId = classes.a;
  classBId = classes.b;
  seed = await seedDisposableEntry({
    showId: SHOW_ID,
    classId: classes.a,
    templateEntryId: TEMPLATE_ENTRY_ID,
    label: 'Section Move',
  });
});

test.afterEach(async () => {
  const current = seed;
  const classIds = [classAId, classBId].filter((id): id is string => id !== null);
  seed = null;
  classAId = null;
  classBId = null;
  const client = getIsolatedAdminClient();
  if (current) {
    // A move leaves several entry rows for the one dog (moved, live, soft-deleted).
    await client.from('entries').delete().eq('dog_id', current.dogId);
    await cleanupDisposableEntry(current);
  }
  if (classIds.length > 0) await client.from('classes').delete().in('id', classIds);
});

/** Show Desk: the dog's row menu in the focused class, Change class, then `confirm` the dialog. */
async function openChangeClass(page: Page, classId: string, callName: string) {
  await page.goto(`/shows/${SHOW_ID}?focus=${classId}`);
  const rowMenu = page.getByRole('button', {
    name: new RegExp(`^Actions for .*${callName}`),
  });
  await expect(rowMenu).toBeVisible({ timeout: 30_000 });
  await rowMenu.click();
  await page.getByRole('menuitem', { name: 'Change class' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/^Current class: /)).toBeVisible();
  return dialog;
}

async function moveAToB(page: Page, classAId: string, callName: string) {
  const dialog = await openChangeClass(page, classAId, callName);
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: new RegExp(`^${CLASS_B_LABEL}`) }).click();
  await dialog.getByRole('button', { name: 'Change class', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

async function moveBackToA(page: Page, classBClassId: string, callName: string) {
  const dialog = await openChangeClass(page, classBClassId, callName);
  await dialog.getByRole('button', { name: new RegExp(`^Move back to ${CLASS_A_LABEL}`) }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

/** Ringside's combined list: the dog is in the run list once and under Not running once. */
async function expectCombinedList(
  page: Page,
  classAClassId: string,
  classBClassId: string,
  callName: string
) {
  await page.goto(`/at-show/${SHOW_ID}/class/${classAClassId}/${classBClassId}`);
  const notRunning = page.locator('details').filter({ hasText: /Not running \(/ });
  await expect(notRunning.getByText('Not running (1)')).toBeVisible({ timeout: 30_000 });

  // Collapsed by design (the judge's thumb lands on the next dog); open it to read the row.
  await notRunning.getByText('Not running (1)').click();
  const oldRows = notRunning.getByTestId('dog-card').filter({ hasText: callName });
  await expect(oldRows).toHaveCount(1);
  await expect(oldRows.getByText(`Moved to ${CLASS_B_LABEL}`)).toHaveCount(1);
  await expect(page.getByText(/Moved to /)).toHaveCount(1);

  // The live entry: exactly one card for the dog outside the Not running group.
  const allCards = page.getByTestId('dog-card').filter({ hasText: callName });
  await expect(allCards).toHaveCount(2);
  const liveCards = page
    .locator('[data-testid="dog-card"]:not(details *)')
    .filter({ hasText: callName });
  await expect(liveCards).toHaveCount(1);
}

test('combined A & B: after a section move the live entry shows once and only the old one is Not running', async ({
  page,
}) => {
  test.setTimeout(240_000);
  if (!seed || !classAId || !classBId) throw new Error('fixture was not seeded');
  const { callName } = seed;

  await signInAsSecretary(page, `/shows/${SHOW_ID}?focus=${classAId}`);
  await moveAToB(page, classAId, callName);
  await expectCombinedList(page, classAId, classBId, callName);
});

test('combined A & B: a device holding the undone entry lists the live one once and only the old one as Not running', async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  if (!seed || !classAId || !classBId) throw new Error('fixture was not seeded');
  const { callName, dogId } = seed;

  await signInAsSecretary(page, `/shows/${SHOW_ID}?focus=${classAId}`);
  await moveAToB(page, classAId, callName);

  // A second device (its own replica) is looking at the combined list when the move is undone, so
  // it holds the entry that is about to be soft-deleted. The undoing browser drops it locally.
  const viewerContext = await browser.newContext();
  try {
    const viewer = await viewerContext.newPage();
    await signInAsSecretary(viewer, `/at-show/${SHOW_ID}/class/${classAId}/${classBId}`);
    await expectCombinedList(viewer, classAId, classBId, callName);

    await moveBackToA(page, classBId, callName);
    await moveAToB(page, classAId, callName);

    // The undo must really have left a soft-deleted Section B row, or this proves nothing.
    const { data: rows, error } = await getIsolatedAdminClient()
      .from('entries')
      .select('id, deleted_at')
      .eq('dog_id', dogId)
      .eq('class_id', classBId);
    expect(error).toBeNull();
    const tombstones = rows?.filter(row => row.deleted_at !== null) ?? [];
    expect(tombstones.length).toBeGreaterThanOrEqual(1);
    expect(rows?.filter(row => row.deleted_at === null)).toHaveLength(1);

    // Reload the viewer and wait until ITS replica holds the tombstone: the list is only a test of
    // the filter when the soft-deleted row is on the device that renders it.
    await viewer.reload();
    for (const tombstone of tombstones) {
      await expect
        .poll(() => readReplicaDeletedAt(viewer, tombstone.id), { timeout: 30_000 })
        .not.toBeNull();
    }
    await expectCombinedList(viewer, classAId, classBId, callName);
  } finally {
    await viewerContext.close();
  }
});

/** `deleted_at` of an entry in this browser's replica; null when absent or live. */
async function readReplicaDeletedAt(page: Page, entryId: string): Promise<string | null> {
  return page.evaluate(
    ({ dbName, entryId }) =>
      new Promise<string | null>(resolve => {
        const openReq = indexedDB.open(dbName);
        openReq.onerror = () => resolve(null);
        openReq.onsuccess = () => {
          const db = openReq.result;
          if (!db.objectStoreNames.contains('replicated_tables')) {
            db.close();
            resolve(null);
            return;
          }
          const getReq = db
            .transaction('replicated_tables', 'readonly')
            .objectStore('replicated_tables')
            .get(['entries', entryId]);
          getReq.onsuccess = () => {
            db.close();
            const data = getReq.result?.data as
              { deleted_at?: string | null; deletedAt?: string | null } | undefined;
            resolve(data?.deleted_at ?? data?.deletedAt ?? null);
          };
          getReq.onerror = () => {
            db.close();
            resolve(null);
          };
        };
      }),
    { dbName: REPLICATION_DB_NAME, entryId }
  );
}
