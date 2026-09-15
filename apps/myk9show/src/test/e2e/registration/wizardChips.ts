/**
 * Shared locators for the registration wizard's class chips.
 *
 * Two specs assert on the same chips, and every trap here has already cost a
 * false failure once:
 *  - `.first()` on the role query is a coin flip on shared staging — the
 *    leading chip may be already entered, blocked or full, all of which render
 *    it unclickable and make the failure read as "Next never enabled".
 *  - the chip's `chip-<classId>` id is the only stable anchor; Base UI mints
 *    its own generated id inside the same <label> and that one CHANGES across
 *    a reload, so anchoring on it fails a page that restored correctly.
 */

import { expect, type Locator, type Page } from '@playwright/test';

export function enabledClassChips(page: Page): Locator {
  return page
    .getByRole('checkbox', { name: /^Select / })
    .and(
      page.locator(
        ':not([disabled]):not([aria-disabled="true"]):not([data-disabled]):not([data-checked])'
      )
    );
}

export function selectedClassChips(page: Page): Locator {
  return page.getByRole('checkbox', { name: /^Select / }).and(page.locator('[data-checked]'));
}

export function chipById(page: Page, id: string): Locator {
  return page
    .getByRole('checkbox', { name: /^Select / })
    .and(page.locator(`[id="${id}"], label:has([id="${id}"]) [role="checkbox"]`));
}

export async function chipClassId(chip: Locator): Promise<string> {
  return chip.evaluate(el => {
    const owner = el.closest('label') ?? el;
    const match = Array.from(owner.querySelectorAll<HTMLElement>('[id]')).find(node =>
      /^(chip|single)-/.test(node.id)
    );
    return match?.id ?? (/^(chip|single)-/.test(el.id) ? el.id : '');
  });
}

/**
 * Availability arrives after the chips render, so a chip enabled on the first
 * frame can turn disabled once its class comes back full. Wait until the
 * enabled set has held still across two polls. An already-selected chip counts
 * as a settled outcome: on shared staging this exhibitor's cart accumulates,
 * and a dog with nothing left to add is a legitimate state, not a hang.
 *
 * Returns how many chips are still addable.
 */
export async function waitForChipsToSettle(page: Page): Promise<number> {
  let previous = -1;
  let settled = 0;
  await expect
    .poll(
      async () => {
        settled = await enabledClassChips(page).count();
        const stable = settled === previous;
        previous = settled;
        return stable && (settled > 0 || (await selectedClassChips(page).count()) > 0);
      },
      { timeout: 30000, intervals: [500] }
    )
    .toBe(true);
  return settled;
}

/**
 * Put exactly one class into a known-selected state and hand back its stable
 * id, plus whether THIS test selected it — the cleanup must only ever un-select
 * a chip the test clicked (LESSONS `confirm-click-destructive`).
 */
export async function aSelectedClass(page: Page): Promise<{ id: string; added: boolean }> {
  if ((await waitForChipsToSettle(page)) > 0) {
    const id = await chipClassId(enabledClassChips(page).first());
    expect(id, 'the chip must carry a chip-<classId> id to anchor the assertion to').not.toBe('');
    const chip = chipById(page, id);
    await expect(chip).toHaveCount(1);
    await chip.click();
    // Toggling a chip in the exhibitor flow WRITES the cart row before the
    // checkbox settles, so this is a network round trip, not a render. The 5s
    // default is not enough on a loaded machine and fails as "the click did
    // nothing".
    await expect(chip.and(page.locator('[data-checked]'))).toHaveCount(1, { timeout: 20000 });
    return { id, added: true };
  }
  // Nothing left to add for this dog — assert on a class already selected. The
  // claim under test (the selection survives) is the same either way.
  const id = await chipClassId(selectedClassChips(page).first());
  expect(id, 'this dog must have at least one class selected to assert on').not.toBe('');
  return { id, added: false };
}

/** Undo `aSelectedClass`, but only when this test is what selected it. */
export async function releaseSelectedClass(
  page: Page,
  { id, added }: { id: string; added: boolean }
): Promise<void> {
  if (!added) return;
  const chip = chipById(page, id);
  await chip.click();
  await expect(chip.and(page.locator('[data-checked]'))).toHaveCount(0, { timeout: 20000 });
}

export async function selectFirstDogAndContinue(page: Page): Promise<void> {
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
