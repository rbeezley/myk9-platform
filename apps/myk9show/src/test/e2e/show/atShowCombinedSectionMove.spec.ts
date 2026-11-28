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
 * Fixture: a disposable dog entered in the seeded Container Novice A, and a disposable
 * Container Novice B in the same trial (the seed has no A/B pair). Both are deleted afterwards.
 * It writes real rows, so it skips unless the target is the isolated stack.
 */

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const CLASS_A_ID = 'dec1a55e-0000-0000-0000-000000000031';
const TEMPLATE_ENTRY_ID = 'dededede-0000-0000-0000-000000000051';
const CLASS_A_LABEL = 'Container Novice A';
const CLASS_B_LABEL = 'Container Novice B';

test.describe.configure({ mode: 'serial' });
test.skip(!isIsolatedTarget(), 'writes real rows: isolated Supabase target only');

let seed: DisposableEntry | null = null;
let classBId: string | null = null;

async function seedSectionB(): Promise<string> {
  const client = getIsolatedAdminClient();
  const { data: classA, error: readError } = await client
    .from('classes')
    .select('*')
    .eq('id', CLASS_A_ID)
    .single();
  if (readError || !classA) {
    throw new Error(`Could not read Container Novice A: ${readError?.message ?? 'missing'}`);
  }
  const {
    id: _id,
    created_at: _createdAt,
    updated_at: _updatedAt,
    ...template
  } = classA as Record<string, unknown>;
  const { data: classB, error } = await client
    .from('classes')
    .insert({ ...template, name: CLASS_B_LABEL, section: 'B' })
    .select('id')
    .single();
  if (error || !classB) {
    throw new Error(`Could not seed Container Novice B: ${error?.message ?? 'missing class'}`);
  }
  return classB.id as string;
}

test.beforeEach(async () => {
  seed = await seedDisposableEntry({
    showId: SHOW_ID,
    classId: CLASS_A_ID,
    templateEntryId: TEMPLATE_ENTRY_ID,
    label: 'Section Move',
  });
  classBId = await seedSectionB();
});

test.afterEach(async () => {
  const current = seed;
  const classId = classBId;
  seed = null;
  classBId = null;
  const client = getIsolatedAdminClient();
  if (current) {
    // A move leaves several entry rows for the one dog (moved, live, soft-deleted).
    await client.from('entries').delete().eq('dog_id', current.dogId);
    await cleanupDisposableEntry(current);
  }
  if (classId) await client.from('classes').delete().eq('id', classId);
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
async function expectCombinedList(page: Page, classBClassId: string, callName: string) {
  await page.goto(`/at-show/${SHOW_ID}/class/${CLASS_A_ID}/${classBClassId}`);
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
  if (!seed || !classBId) throw new Error('fixture was not seeded');
  const { callName } = seed;

  await signInAsSecretary(page, `/shows/${SHOW_ID}?focus=${CLASS_A_ID}`);
  await moveAToB(page, CLASS_A_ID, callName);
  await expectCombinedList(page, classBId, callName);
});

test('combined A & B: a move undone and made again leaves no soft-deleted entry in the list', async ({
  page,
}) => {
  test.setTimeout(240_000);
  if (!seed || !classBId) throw new Error('fixture was not seeded');
  const { callName, dogId } = seed;

  await signInAsSecretary(page, `/shows/${SHOW_ID}?focus=${CLASS_A_ID}`);
  await moveAToB(page, CLASS_A_ID, callName);
  await moveBackToA(page, classBId, callName);
  await moveAToB(page, CLASS_A_ID, callName);

  // The undo must really have left a soft-deleted Section B row, or this proves nothing.
  const { data: rows, error } = await getIsolatedAdminClient()
    .from('entries')
    .select('id, class_id, deleted_at')
    .eq('dog_id', dogId)
    .eq('class_id', classBId);
  expect(error).toBeNull();
  expect(rows?.filter(row => row.deleted_at !== null).length).toBeGreaterThanOrEqual(1);
  expect(rows?.filter(row => row.deleted_at === null)).toHaveLength(1);

  await expectCombinedList(page, classBId, callName);
});
