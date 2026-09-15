/**
 * MYK9-514 / MYK9-509 — the wizard rehydrates from its own saved draft.
 *
 * The wizard's `selectedDogs` / `classSelections` are React state. Before this
 * spec's fix a reload rebuilt them from nothing and dropped the exhibitor back
 * on Select dogs while the cart still held the fees — and the cancelled-checkout
 * Continue Shopping path landed on the same empty wizard. One persisted draft,
 * rehydrated on mount, covers both triggers, so one reload assertion pins both.
 *
 * Read-only with respect to money: nothing here opens a Stripe session.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';
import { signInAsExhibitor } from '../helpers/testUsers';
import { LIVE_REGISTRATION_SHOW_ID } from '../uat/shared/seededShows';

test.describe.configure({ mode: 'serial', timeout: 120000 });

const SHOW_ID = LIVE_REGISTRATION_SHOW_ID;

/**
 * On shared staging `.first()` is a coin flip — the leading chip may be already
 * entered, blocked, or full, all of which render it unclickable and make the
 * failure read as "Next never enabled". Intersect with the not-disabled set.
 */
function enabledClassChips(page: Page) {
  return page
    .getByRole('checkbox', { name: /^Select / })
    .and(
      page.locator(
        ':not([disabled]):not([aria-disabled="true"]):not([data-disabled]):not([data-checked])'
      )
    );
}

async function waitForSelectableClass(page: Page): Promise<boolean> {
  let previous = -1;
  let settled = 0;
  await expect
    .poll(
      async () => {
        settled = await enabledClassChips(page).count();
        const stable = settled === previous;
        previous = settled;
        return stable && settled > 0;
      },
      { timeout: 30000, intervals: [500] }
    )
    .toBe(true);
  return settled > 0;
}

/**
 * Add exactly ONE class and hand back a locator anchored to THAT chip's DOM id.
 * The accessible name is not unique ("Select Novice" exists under every
 * element), and `.last()` on a checked chip un-selects whichever pre-existing
 * cart line happens to render last (LESSONS `confirm-click-destructive`).
 */
async function addOneClass(page: Page): Promise<Locator> {
  expect(await waitForSelectableClass(page), 'this dog must have a class left to add').toBe(true);
  const id = await enabledClassChips(page)
    .first()
    .evaluate(el => el.id || el.closest('label')?.querySelector('[id]')?.id || '');
  expect(id, 'the chip must carry a DOM id to anchor the assertion to').not.toBe('');
  const chip = page
    .getByRole('checkbox', { name: /^Select / })
    .and(page.locator(`[id="${id}"], label:has([id="${id}"]) [role="checkbox"]`));
  await expect(chip).toHaveCount(1);
  await chip.click();
  await expect(chip.and(page.locator('[data-checked]'))).toHaveCount(1);
  return chip;
}

async function selectFirstDog(page: Page) {
  await expect(page.getByRole('heading', { name: 'Select Dogs to Register' })).toBeVisible({
    timeout: 20000,
  });
  const namedDogOptions = page.locator('[role="checkbox"][aria-label^="Select "]');
  if ((await namedDogOptions.count()) > 0) {
    await namedDogOptions.first().click();
  } else {
    await page.getByRole('checkbox').first().click();
  }
  await expect(page.getByRole('button', { name: /^Next$/ })).toBeEnabled();
  await page.getByRole('button', { name: /^Next$/ }).click();
}

test('a reload on Select classes restores the step, the dog and the selected class', async ({
  page,
}) => {
  await signInAsExhibitor(page, `/shows/${SHOW_ID}/register`);
  await selectFirstDog(page);
  await expect(page.getByRole('heading', { name: 'Select Classes', exact: true })).toBeVisible({
    timeout: 20000,
  });

  const chip = await addOneClass(page);
  const chipId = await chip.evaluate(el => el.id || el.closest('label')?.querySelector('[id]')?.id);
  // The draft is written on `pagehide`, which a reload fires. Give the write a
  // beat so the assertion is about rehydration, not about a race with the save.
  await page.waitForTimeout(500);

  await page.reload();

  // The step heading — not the cart — is the claim. Before the fix this read
  // "Select Dogs to Register".
  await expect(page.getByRole('heading', { name: 'Select Classes', exact: true })).toBeVisible({
    timeout: 30000,
  });
  const restoredChip = page
    .getByRole('checkbox', { name: /^Select / })
    .and(page.locator(`[id="${chipId}"], label:has([id="${chipId}"]) [role="checkbox"]`));
  await expect(restoredChip.and(page.locator('[data-checked]'))).toHaveCount(1, {
    timeout: 30000,
  });

  // Amendable, not just visible: MYK9-509 asks that the exhibitor can add
  // another class to the restored selection without starting over.
  await expect(page.getByRole('button', { name: /^Next$/ })).toBeEnabled();

  // Leave the shared staging cart as we found it.
  await restoredChip.click();
  await expect(restoredChip.and(page.locator('[data-checked]'))).toHaveCount(0);
});
