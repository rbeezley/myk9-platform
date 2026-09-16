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
 * The wizard's persistent sticky overlays. At 393x727 (Pixel 5) they leave a
 * band of roughly 157px between them, so every control the helpers click has to
 * land inside that band or Playwright's actionability check reports one of
 * these subtrees as the interceptor.
 */
const STICKY_WIZARD_OVERLAYS = ['registration-wizard-header', 'entries-panel-bar'] as const;

/**
 * Sonner docks its toasts directly above `entries-panel-bar` -- INSIDE the band
 * this helper aims for -- so a toast is an interceptor exactly like the sticky
 * chrome (MYK9-517). Unlike the chrome it is transient, so the helper waits it
 * out first and only treats a surviving toast as an overlay.
 */
const TRANSIENT_TOAST_SELECTOR = '[data-sonner-toast][data-visible="true"]';

/** How long to let a toast auto-dismiss before treating it as a fixed overlay. */
const TOAST_DISMISS_TIMEOUT_MS = 8000;

type Box = { x: number; y: number; width: number; height: number };

function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function overlapsHorizontally(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width;
}

function describeBox(box: Box | null): string {
  return box
    ? `x=${Math.round(box.x)} y=${Math.round(box.y)} w=${Math.round(box.width)} h=${Math.round(box.height)}`
    : 'not rendered';
}

/**
 * Let any visible toast auto-dismiss before measuring. Bounded: a toast that
 * outlives this stays in the overlay list, so the assertion names it rather
 * than the helper waiting forever or pretending it is not there.
 */
async function waitOutToasts(page: Page): Promise<void> {
  const deadline = Date.now() + TOAST_DISMISS_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await page.locator(TRANSIENT_TOAST_SELECTOR).count()) === 0) return;
    await page.waitForTimeout(250);
  }
}

/**
 * Every overlay that could cover `target`: the persistent sticky chrome plus
 * any toast still on screen.
 *
 * An overlay that CONTAINS the target is not an obstruction -- the wizard's
 * Back/Next bar lives inside the "Your entries" bar, and no scroll position
 * moves a control out of its own container (MYK9-517).
 */
async function stickyOverlayBoxes(
  page: Page,
  target: Locator,
  { includeToasts = true }: { includeToasts?: boolean } = {}
): Promise<Array<{ name: string; box: Box }>> {
  const handle = await target.elementHandle();
  try {
    const candidates: Array<{ name: string; locator: Locator }> = STICKY_WIZARD_OVERLAYS.map(
      name => ({ name, locator: page.getByTestId(name) })
    );
    if (includeToasts) {
      const toasts = page.locator(TRANSIENT_TOAST_SELECTOR);
      const toastCount = await toasts.count();
      for (let index = 0; index < toastCount; index += 1) {
        candidates.push({ name: `sonner-toast[${index}]`, locator: toasts.nth(index) });
      }
    }

    const found: Array<{ name: string; box: Box }> = [];
    for (const { name, locator } of candidates) {
      if ((await locator.count()) === 0) continue;
      const overlay = locator.first();
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

/**
 * The largest vertical gap the overlays leave inside the viewport, measured
 * only against overlays that actually sit over the target's own column.
 *
 * Deliberately a gap sweep rather than a "top-anchored vs bottom-anchored"
 * guess: a header taller than half the viewport would fool that heuristic into
 * reporting the band as the strip ABOVE it and scrolling the target into the
 * header.
 */
function uncoveredBand(
  overlays: Array<{ name: string; box: Box }>,
  targetBox: Box,
  viewportHeight: number
): { top: number; bottom: number } {
  const spans = overlays
    .filter(({ box }) => overlapsHorizontally(targetBox, box))
    .map(({ box }) => ({
      top: Math.max(0, box.y),
      bottom: Math.min(viewportHeight, box.y + box.height),
    }))
    .filter(span => span.bottom > span.top)
    .sort((a, b) => a.top - b.top);

  // Seeded EMPTY, not as the whole viewport: seeding it with {0, viewportHeight}
  // makes every real gap smaller than the seed, so the "band" stays the whole
  // viewport and the helper centres the target behind the sticky header.
  let best = { top: 0, bottom: 0 };
  let cursor = 0;
  for (const span of spans) {
    if (span.top - cursor > best.bottom - best.top) best = { top: cursor, bottom: span.top };
    cursor = Math.max(cursor, span.bottom);
  }
  if (viewportHeight - cursor > best.bottom - best.top) {
    best = { top: cursor, bottom: viewportHeight };
  }
  return best;
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
 * The target's box once it has stopped moving, or a throw naming the target.
 *
 * The dog list re-renders while the cart and availability load, so a box read
 * mid-settle is a measurement of a moving target: the helper positions it
 * correctly and Playwright's own hit test, a beat later, finds the sticky
 * header over it again. Returning the last unsettled box would be
 * indistinguishable from a settled one, so a target still moving after three
 * seconds is reported rather than measured.
 */
async function settledBox(page: Page, target: Locator): Promise<Box | null> {
  let previous = '';
  let box: Box | null = null;
  for (let sample = 0; sample < 20; sample += 1) {
    box = await target.boundingBox();
    const key = box
      ? `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)},${Math.round(box.height)}`
      : 'none';
    if (key === previous) return box;
    previous = key;
    await page.waitForTimeout(150);
  }
  throw new Error(
    `${target} never stopped moving: its box was still changing after 20 samples ` +
      `(last: ${describeBox(box)})`
  );
}

/**
 * Put `target` in the MIDDLE of the band the sticky wizard chrome leaves
 * uncovered, then ASSERT it is clear of every overlay before the caller clicks
 * (MYK9-543).
 *
 * `scrollIntoViewIfNeeded` and `scrollIntoView({block:'center'})` are what
 * already fail here: both are blind to `position: sticky`, so on a phone they
 * park the row under the 366px header and the click is intercepted. Centring in
 * the band rather than nudging just past the header edge is deliberate: the
 * wizard is still settling while the cart loads, and a target sitting a few px
 * below the header drifts back under it between the measurement and
 * Playwright's own hit test. A `force: true` click would pass on the very
 * overlap this exists to catch, so this scrolls for real and keeps the
 * non-intersection assertion: if the shell ever shrinks the band below the
 * control, the failure names every box instead of reading as "the click did
 * nothing".
 */
async function scrollClearOfStickyChrome(page: Page, target: Locator): Promise<void> {
  await waitOutToasts(page);
  await target.scrollIntoViewIfNeeded();
  const viewportHeight = page.viewportSize()?.height ?? 0;
  let previousY: number | null = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const box = await settledBox(page, target);
    if (!box) break;
    const overlays = await stickyOverlayBoxes(page, target);
    const clear = !overlays.some(overlay => boxesOverlap(box, overlay.box));
    // The band is defined by the PERSISTENT chrome only. A toast is fixed to
    // the viewport, so scrolling cannot move the target out from under it --
    // the answer to a toast is to wait it out, and to name it in the assertion
    // if it outlives that. Letting one shrink the band instead makes the
    // largest remaining gap the 48px strip ABOVE the header, and the helper
    // then scrolls the target INTO the header.
    const band = uncoveredBand(
      await stickyOverlayBoxes(page, target, { includeToasts: false }),
      box,
      viewportHeight
    );
    const delta = (band.top + band.bottom) / 2 - (box.y + box.height / 2);
    // Clear and centred, or clear and immovable: the Next button is pinned
    // inside the entries bar, so no amount of scrolling recentres it and
    // looping on would pay six `settledBox` waits for nothing.
    if (clear && Math.abs(delta) < 2) break;
    if (clear && previousY !== null && Math.abs(box.y - previousY) < 1) break;
    previousY = box.y;
    await scrollTargetBy(target, delta);
    await page.waitForTimeout(100);
  }

  const finalBox = await settledBox(page, target);
  const overlays = await stickyOverlayBoxes(page, target);
  const overlayList = overlays
    .map(overlay => `${overlay.name} [${describeBox(overlay.box)}]`)
    .join(', ');
  // A target with no box is not "clear" -- it is detached, hidden or zero-sized,
  // and filtering it away would let the assertion pass vacuously.
  expect(finalBox, `${target} has no bounding box, so it cannot be clicked`).not.toBeNull();
  const blocked = overlays
    .filter(overlay => finalBox && boxesOverlap(finalBox, overlay.box))
    .map(overlay => `${overlay.name} [${describeBox(overlay.box)}]`);
  expect(
    blocked,
    `the target [${describeBox(finalBox)}] must sit in the band the sticky wizard chrome leaves ` +
      `uncovered at ${page.viewportSize()?.width ?? '?'}x${viewportHeight}; overlays: ${overlayList}`
  ).toEqual([]);
}

/**
 * Click `target` only after it is clear of the sticky wizard chrome.
 *
 * Positioning once is not enough: Playwright runs its OWN `scrollIntoViewIfNeeded`
 * as part of the click's actionability check, and the page keeps settling while
 * the cart and the dog list load, so a row parked in the band can drift back
 * under the header between the measurement and the hit test. Re-position and
 * retry rather than forcing the click -- a `force: true` click would pass on
 * the very overlap this exists to catch.
 *
 * The positioning is INSIDE the retry: a transient overlap on the first attempt
 * is exactly what the retry exists for, and hard-failing there would abort
 * `releaseSelectedClass` and leave this test's row selected on shared staging.
 * The last attempt runs outside it so a genuine structural overlap fails with
 * every box named rather than as Playwright's raw intercept error.
 */
export async function clickClearOfStickyChrome(page: Page, target: Locator): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await scrollClearOfStickyChrome(page, target);
      await target.click({ timeout: 7000 });
      return;
    } catch (error) {
      lastError = error;
      await waitOutToasts(page);
    }
  }
  await scrollClearOfStickyChrome(page, target);
  throw lastError;
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
  await clickClearOfStickyChrome(page, dogOption);
  const next = page.getByRole('button', { name: /^Next$/ });
  await expect(next).toBeEnabled();
  await clickClearOfStickyChrome(page, next);
}
