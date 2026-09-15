/**
 * MYK9-530 — re-clicking an already-selected class chip DESELECTS it.
 *
 * The chip's checked state (`inCart || inSelection`) and the toggle's branch
 * (`findCartItem` alone) used two different predicates, so a chip that rendered
 * selected without a local cart row fell into the ADD path and the insert died
 * on `entry_cart_items_unique_dog_class_idx` (23505), leaving the cart badge
 * undercounting until the next cart reload.
 *
 * The cart badge on the dog tab is the assertion that matters: it is computed
 * from the real `cart.items` list (`getCartCountForDog`), so it moves only when
 * the DB-backed list does — it catches both a duplicate insert and a local list
 * that has fallen short of the DB.
 *
 * Nothing here opens a Stripe session or submits an entry, and the test
 * releases its own selection through the UI before it ends.
 */

import { expect, test } from '@playwright/test';
import { signInAsExhibitor } from '../helpers/testUsers';
import {
  chipById,
  chipClassId,
  enabledClassChips,
  selectFirstDogAndContinue,
  waitForChipsToSettle,
} from './wizardChips';

test.describe.configure({ mode: 'serial', timeout: 180000 });

// The UKC sibling of the seeded Heartland show. Deliberately not the AKC show
// the other registration specs use, so a concurrent run of those cannot move
// this exhibitor's cart count underneath these assertions.
const SHOW_ID = 'dededede-0000-0000-0000-000000000011';

const EVIDENCE = '../../.logs/evidence-530';

/** The dog tab's cart badge, whose title reads "N class(es) in cart". */
function cartBadgeCount(page: import('@playwright/test').Page) {
  return page.locator('[title$="in cart"], [title$="in cart"] >> visible=true');
}

async function cartCount(page: import('@playwright/test').Page): Promise<number> {
  const badge = cartBadgeCount(page).first();
  if ((await cartBadgeCount(page).count()) === 0) return 0;
  const title = (await badge.getAttribute('title')) ?? '';
  const match = /^(\d+) class/.exec(title);
  return match ? Number(match[1]) : 0;
}

test('select, re-click to deselect, select again — no error, count correct throughout', async ({
  page,
}) => {
  // Below the tablet breakpoint the shared `selectFirstDogAndContinue` helper
  // cannot click the dog row at all: the sticky wizard header and the sticky
  // "Your entries" bar both intercept the click. That is pre-existing and
  // nothing to do with this fix — the already-merged `wizardRehydrate.spec.ts`
  // fails identically on the `mobile-chrome` project — so this spec asserts
  // where the helper works rather than adding a second red for the same cause.
  const width = page.viewportSize()?.width ?? 0;
  test.skip(
    width > 0 && width < 768,
    'selectFirstDogAndContinue cannot click the dog row under the sticky wizard chrome at phone width (pre-existing)'
  );

  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`));

  await signInAsExhibitor(page, `/shows/${SHOW_ID}/register`);
  await selectFirstDogAndContinue(page);
  await expect(page.getByRole('heading', { name: 'Select Classes', exact: true })).toBeVisible({
    timeout: 30000,
  });

  // ── 1. Select ─────────────────────────────────────────────────────────────
  // `waitForChipsToSettle`, not a bare count poll: availability arrives after
  // the chips render, so a chip enabled on the first frame can turn disabled a
  // moment later. Clicking that one focuses it and fires nothing, which reads
  // as "the fix did not work" rather than "the click was too early".
  //
  // This also subsumes the explicit `cartRecoveryInfo` poll this spec used to
  // carry: the chips now render DISABLED until this show's and this exhibitor's
  // cart has finished loading (MYK9-542), and `enabledClassChips` excludes
  // `aria-disabled="true"`, so a settled enabled chip IS the readiness signal.
  expect(
    await waitForChipsToSettle(page),
    'this dog must have a class left to add'
  ).toBeGreaterThan(0);

  // Read AFTER the chips settle, for the same reason: before the cart loads the
  // badge reports 0 for a cart that is about to arrive holding rows.
  const baseline = await cartCount(page);
  await page.screenshot({ path: `${EVIDENCE}/01-before.png`, fullPage: true });
  const classId = await chipClassId(enabledClassChips(page).first());
  expect(classId, 'the chip must carry a chip-<classId> id to anchor on').not.toBe('');
  const chip = chipById(page, classId);
  await expect(chip).toHaveCount(1);

  await chip.click();
  await expect(chip.and(page.locator('[data-checked]'))).toHaveCount(1, { timeout: 25000 });
  await expect.poll(() => cartCount(page), { timeout: 25000 }).toBe(baseline + 1);
  await page.screenshot({ path: `${EVIDENCE}/02-selected.png`, fullPage: true });

  // ── 2. Re-click the SELECTED chip: it must deselect, not re-insert ────────
  // This is the exact click that raised the 23505.
  await chip.click();
  await expect(chip.and(page.locator('[data-checked]'))).toHaveCount(0, { timeout: 25000 });
  await expect.poll(() => cartCount(page), { timeout: 25000 }).toBe(baseline);
  await page.screenshot({ path: `${EVIDENCE}/03-deselected.png`, fullPage: true });

  // ── 3. Select again ──────────────────────────────────────────────────────
  await chip.click();
  await expect(chip.and(page.locator('[data-checked]'))).toHaveCount(1, { timeout: 25000 });
  await expect.poll(() => cartCount(page), { timeout: 25000 }).toBe(baseline + 1);
  await page.screenshot({ path: `${EVIDENCE}/04-reselected.png`, fullPage: true });

  // ── 4. Clean up through the UI ───────────────────────────────────────────
  await chip.click();
  await expect(chip.and(page.locator('[data-checked]'))).toHaveCount(0, { timeout: 25000 });
  await expect.poll(() => cartCount(page), { timeout: 25000 }).toBe(baseline);
  await page.screenshot({ path: `${EVIDENCE}/05-cleaned-up.png`, fullPage: true });

  // A 23505 surfaces as a console error from the cart store's logger, so this
  // is the regression's own signature and not a generic tidiness assertion.
  const duplicates = consoleErrors.filter(
    e => /23505|duplicate key|entry_cart_items_unique/.test(e) || /Failed to add to cart/.test(e)
  );
  expect(duplicates, 'no duplicate-insert error may appear').toEqual([]);
});
