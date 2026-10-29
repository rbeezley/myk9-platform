import { expect, test, type Page } from '@playwright/test';
import { signInAsExhibitor } from '../helpers/testUsers';
import { getIsolatedAdminClient, isIsolatedTarget } from '../helpers/isolatedFixtures';
import { aSelectedClass, selectFirstDogAndContinue, waitForChipsToSettle } from './wizardChips';

/**
 * Suite category: regression (isolated only).
 *
 * MYK9-226. Four test-mode carts were once charged for lines the server then
 * denied (a full class with `allow_waitlist = false`), and refunded in full. The
 * fix drops such a line before it can be paid for: every cart load calls
 * `reconcile_cart_closed_classes` (`store/cartStore.classClosure.ts`), one server
 * call that decides and deletes, and the wizard says so with
 * `ClosedClassRemovedNotice`.
 *
 * This spec rebuilds the incident's shape: a valid line goes in the cart, then a
 * line for a class that is full (as if it filled after being added) is planted
 * with the service key. On the next load the server must delete that line and the
 * wizard must say it was not charged, before the Payment step is reachable. The
 * walk stops there, so nothing reaches Stripe. Both kinds of fullness are covered:
 * the per-class limit, and the judge-day capacity this incident actually hit.
 */

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
// Handler Discrimination Advanced: max 1, 1 entered, no waitlist (seed).
const PER_CLASS_FULL = 'dec1a55e-0000-0000-0000-000000000045';
// Interior Advanced, judged on Dec 13 with ...031 and ...033; full once that judge day is capped.
const JUDGE_DAY_CLASS = 'dec1a55e-0000-0000-0000-000000000032';
const JUDGE_DAY_ASSIGNMENTS = [
  'dededede-0000-0000-0000-0000000000b1',
  'dededede-0000-0000-0000-0000000000b2',
  'dededede-0000-0000-0000-0000000000b3',
];

test.describe.configure({ mode: 'serial', timeout: 240_000 });
test.skip(!isIsolatedTarget(), 'plants cart rows: isolated Supabase target only');

type SavedOverrides = Array<{ id: string; day_capacity_override: number | null }>;

/** Caps the Dec 13 judge day at its current load; returns the overrides it replaced. */
async function capJudgeDay(): Promise<SavedOverrides> {
  const client = getIsolatedAdminClient();
  const { data: saved, error: savedError } = await client
    .from('judge_assignments')
    .select('id, day_capacity_override')
    .in('id', JUDGE_DAY_ASSIGNMENTS);
  if (savedError) throw new Error(`Could not read judge-day overrides: ${savedError.message}`);
  const { data, error } = await client.rpc('get_show_class_judge_day_availability', {
    p_show_id: SHOW_ID,
  });
  if (error) throw new Error(`Could not read judge-day availability: ${error.message}`);
  // RETURNS TABLE of get_show_class_judge_day_availability (20261005031700): the day is
  // full when capacity equals what is taken plus what mail-in entries reserve.
  const row = (
    data as Array<{ class_id: string; day_taken: number; day_mail_in_reserved: number }>
  ).find(r => r.class_id === JUDGE_DAY_CLASS);
  if (!row) throw new Error(`No judge-day row for ${JUDGE_DAY_CLASS}`);
  const { error: capError } = await client
    .from('judge_assignments')
    .update({ day_capacity_override: row.day_taken + row.day_mail_in_reserved })
    .in('id', JUDGE_DAY_ASSIGNMENTS);
  if (capError) throw new Error(`Could not cap the judge day: ${capError.message}`);
  return (saved ?? []) as SavedOverrides;
}

async function restoreJudgeDay(saved: SavedOverrides) {
  const client = getIsolatedAdminClient();
  for (const assignment of saved) {
    const { error } = await client
      .from('judge_assignments')
      .update({ day_capacity_override: assignment.day_capacity_override })
      .eq('id', assignment.id);
    if (error) throw new Error(`Could not restore ${assignment.id}: ${error.message}`);
  }
}

async function droppedOnNextLoad(page: Page, fullClassId: string, fullClassName: string) {
  const client = getIsolatedAdminClient();
  // Every cart line that exists now; anything new at the end was this test's and is deleted.
  const { data: existingItems, error: existingError } = await client
    .from('entry_cart_items')
    .select('id');
  if (existingError) throw new Error(`Could not read cart lines: ${existingError.message}`);
  const preexisting = new Set((existingItems ?? []).map(item => item.id as string));
  let plantedId = '';
  try {
    await signInAsExhibitor(page, `/shows/${SHOW_ID}/register`);
    await selectFirstDogAndContinue(page);
    await expect(page.getByRole('heading', { name: 'Select Classes', exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await waitForChipsToSettle(page);

    // A real line, so the cart exists; then a stale line for the full class in the same cart.
    // The template is the line this test's own selection created: new since the snapshot,
    // never another cart's line for the same class.
    const selected = await aSelectedClass(page);
    expect(selected.added, 'the spec needs a class it selected itself, not a reused one').toBe(
      true
    );
    const realClassId = selected.id.replace(/^chip-/, '');
    let base: Record<string, unknown> | undefined;
    await expect
      .poll(
        async () => {
          const { data } = await client
            .from('entry_cart_items')
            .select('id, cart_id, dog_id, handler_id, entry_fee_cents')
            .eq('class_id', realClassId);
          const created = (data ?? []).filter(line => !preexisting.has(line.id as string));
          base = created.length === 1 ? created[0] : undefined;
          return created.length;
        },
        { timeout: 30_000, message: 'the selection did not create exactly one new cart line' }
      )
      .toBe(1);
    const { data: planted, error: plantError } = await client
      .from('entry_cart_items')
      .insert({
        cart_id: base!.cart_id,
        dog_id: base!.dog_id,
        handler_id: base!.handler_id,
        class_id: fullClassId,
        entry_fee_cents: base!.entry_fee_cents,
      })
      .select('id')
      .single();
    if (plantError || !planted)
      throw new Error(`Could not plant the stale line: ${plantError?.message}`);
    plantedId = planted.id;

    // The next load reconciles the cart on the server, before Payment is reachable.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Select Classes', exact: true })).toBeVisible({
      timeout: 30_000,
    });
    // "it" for one removed line, "them" when the capped day also filled the valid line's class.
    await expect(page.getByText(/so you will not be charged for (it|them)/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole('listitem').filter({ hasText: `in ${fullClassName}: this class is full` })
    ).toBeVisible();
    await expect
      .poll(
        async () => {
          const { data } = await client.from('entry_cart_items').select('id').eq('id', plantedId);
          return data?.length ?? -1;
        },
        { timeout: 15_000, message: 'the server left the full-class line in the cart' }
      )
      .toBe(0);
  } finally {
    const { data: after } = await client.from('entry_cart_items').select('id');
    const created = (after ?? []).map(item => item.id as string).filter(id => !preexisting.has(id));
    if (created.length) await client.from('entry_cart_items').delete().in('id', created);
  }
}

test('a per-class-full no-waitlist line is dropped on the next cart load', async ({ page }) => {
  await droppedOnNextLoad(page, PER_CLASS_FULL, 'Handler Discrimination Advanced');
});

test('a judge-day-full no-waitlist line is dropped on the next cart load', async ({ page }) => {
  const saved = await capJudgeDay();
  try {
    await droppedOnNextLoad(page, JUDGE_DAY_CLASS, 'Interior Advanced');
  } finally {
    await restoreJudgeDay(saved);
  }
});
