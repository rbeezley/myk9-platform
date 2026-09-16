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
    await clickClearOfStickyChrome(page, chip);
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

/**
 * Add ONE more class beyond whatever is already selected, and hand back its
 * stable id — or null when this dog genuinely has nothing left to add.
 *
 * The null case is real on shared staging (this exhibitor's cart accumulates,
 * and classes fill), so the caller decides whether that is a skip or a failure
 * rather than this helper inventing a click that cannot happen.
 */
export async function addAnotherClass(page: Page): Promise<{ id: string } | null> {
  if ((await waitForChipsToSettle(page)) === 0) return null;
  const id = await chipClassId(enabledClassChips(page).first());
  if (!id) return null;
  const chip = chipById(page, id);
  await expect(chip).toHaveCount(1);
  await clickClearOfStickyChrome(page, chip);
  // A cart write, not a render — see `aSelectedClass`.
  await expect(chip.and(page.locator('[data-checked]'))).toHaveCount(1, { timeout: 20000 });
  return { id };
}

/** Undo `aSelectedClass`, but only when this test is what selected it. */
export async function releaseSelectedClass(
  page: Page,
  { id, added }: { id: string; added: boolean }
): Promise<void> {
  if (!added) return;
  const chip = chipById(page, id);
  await clickClearOfStickyChrome(page, chip);
  await expect(chip.and(page.locator('[data-checked]'))).toHaveCount(0, { timeout: 20000 });
}

/**
 * The wizard's two sticky overlays. At 393x727 (Pixel 5) they leave a band of
 * roughly 157px between them, so every control the helpers click has to land
 * inside that band or Playwright's actionability check reports one of these
 * subtrees as the interceptor.
 */
const STICKY_WIZARD_OVERLAYS = ['registration-wizard-header', 'entries-panel-bar'] as const;

/** Keep this much clear air between the target and an overlay edge. */
const UNCOVERED_BAND_MARGIN = 8;

type Box = { x: number; y: number; width: number; height: number };

function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function describeBox(box: Box | null): string {
  return box
    ? `x=${Math.round(box.x)} y=${Math.round(box.y)} w=${Math.round(box.width)} h=${Math.round(box.height)}`
    : 'not rendered';
}

/**
 * The sticky overlays that could cover `target`. An overlay that CONTAINS the
 * target is not an obstruction: the wizard's Back/Next bar lives inside the
 * "Your entries" bar, and no scroll position moves a control out of its own
 * container (MYK9-517).
 */
async function stickyOverlayBoxes(
  page: Page,
  target: Locator
): Promise<Array<{ name: string; box: Box }>> {
  const handle = await target.elementHandle();
  try {
    const found: Array<{ name: string; box: Box }> = [];
    for (const name of STICKY_WIZARD_OVERLAYS) {
      const overlay = page.getByTestId(name).first();
      if ((await page.getByTestId(name).count()) === 0) continue;
      if (handle && (await overlay.evaluate((el, node) => el.contains(node as Node), handle))) {
        continue;
      }
      const box = await overlay.boundingBox();
      if (box) found.push({ name, box });
    }
    return found;
  } finally {
    await handle?.dispose();
  }
}

/** Scroll the target's own scroll container so the target moves `delta` px DOWN the screen. */
async function scrollTargetBy(target: Locator, delta: number): Promise<void> {
  await target.evaluate((el, amount) => {
    let node: HTMLElement | null = el as HTMLElement;
    while (node) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
        node.scrollTop -= amount;
        return;
      }
      node = node.parentElement;
    }
    window.scrollBy(0, -amount);
  }, delta);
}

/**
 * Put `target` in the band the sticky wizard chrome leaves uncovered, then
 * ASSERT it is clear of both overlays before the caller clicks (MYK9-543).
 *
 * `scrollIntoViewIfNeeded` — and `scrollIntoView({block:'center'})` — are what
 * already fail here: both are blind to `position: sticky`, so on a phone they
 * park the row under the 366px header and the click is intercepted. A
 * `force: true` click would pass on the very overlap it hides, so this scrolls
 * for real and keeps the non-intersection assertion: if the shell ever shrinks
 * the band below the control, the failure names both boxes instead of reading
 * as "the click did nothing".
 */
export async function scrollClearOfStickyChrome(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const viewportHeight = page.viewportSize()?.height ?? 0;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const box = await target.boundingBox();
    if (!box) break;
    const covering = (await stickyOverlayBoxes(page, target)).find(overlay =>
      boxesOverlap(box, overlay.box)
    );
    if (!covering) break;
    // Top-anchored chrome is cleared by moving the target DOWN, bottom-anchored
    // chrome by moving it UP.
    const spaceBelowOverlay = viewportHeight - (covering.box.y + covering.box.height);
    const delta =
      covering.box.y <= spaceBelowOverlay
        ? covering.box.y + covering.box.height + UNCOVERED_BAND_MARGIN - box.y
        : covering.box.y - UNCOVERED_BAND_MARGIN - (box.y + box.height);
    await scrollTargetBy(target, delta);
    await page.waitForTimeout(100);
  }

  const finalBox = await target.boundingBox();
  const overlays = await stickyOverlayBoxes(page, target);
  const blocked = overlays
    .filter(overlay => finalBox && boxesOverlap(finalBox, overlay.box))
    .map(overlay => `${overlay.name} [${describeBox(overlay.box)}]`);
  expect(
    blocked,
    `the target [${describeBox(finalBox)}] must sit in the band the sticky wizard chrome leaves ` +
      `uncovered at ${page.viewportSize()?.width ?? '?'}px; overlays: ` +
      overlays.map(overlay => `${overlay.name} [${describeBox(overlay.box)}]`).join(', ')
  ).toEqual([]);
}

/** Click `target` only after it is clear of the sticky wizard chrome. */
export async function clickClearOfStickyChrome(page: Page, target: Locator): Promise<void> {
  await scrollClearOfStickyChrome(page, target);
  await target.click();
}

export async function selectFirstDogAndContinue(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Select Dogs to Register' })).toBeVisible({
    timeout: 20000,
  });
  const namedDogOptions = page.locator('[role="checkbox"][aria-label^="Select "]');
  const dogOption =
    (await namedDogOptions.count()) > 0
      ? namedDogOptions.first()
      : page.getByRole('checkbox').first();
  await scrollClearOfStickyChrome(page, dogOption);
  await dogOption.click();
  const next = page.getByRole('button', { name: /^Next$/ });
  await expect(next).toBeEnabled();
  await scrollClearOfStickyChrome(page, next);
  await next.click();
}
