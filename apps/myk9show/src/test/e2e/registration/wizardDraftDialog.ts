/**
 * Save a registration draft through the wizard's Save Draft dialog (MYK9-627).
 *
 * The raw `click()` sequence this replaces failed a different wizardVisualQA
 * scenario on each sweep, for two separate reasons:
 *  - `element is not stable`: the dialog zooms and slides in over 200ms
 *    (`animate-in zoom-in-95 slide-in-from-top-[48%]` in `ui/dialog`), so the
 *    dialog's own Save Draft button is still moving when the click lands. The
 *    dialog's CSS animations are awaited to completion before anything inside
 *    it is touched.
 *  - pointer interception: the Sonner toast and the sticky entries bar sit over
 *    the page's Save Draft trigger at phone and 960x652 tablet sizes. Both
 *    buttons go through `clickClearOfStickyChrome`, the MYK9-543 hit-test probe,
 *    which clicks only once the browser says a click at the button's centre
 *    reaches it, and names the element that won the point when none does.
 *
 * `force: true` is never used: it would pass on the very overlap the visual QA
 * spec exists to catch.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import { clickClearOfStickyChrome } from './wizardChips';

/**
 * Resolve once every finite CSS animation on `root` and its subtree has
 * finished. An infinite one (a spinner) never finishes, so it is skipped rather
 * than waited out until the test times out.
 *
 * The root must be the element that animates or an ancestor of it:
 * `getAnimations({ subtree: true })` does not look upward.
 */
export async function waitForAnimationsToSettle(root: Locator): Promise<void> {
  await root.evaluate(async el => {
    const finite = el
      .getAnimations({ subtree: true })
      .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity);
    // A cancelled animation rejects `finished`; it has stopped moving either way.
    await Promise.all(finite.map(animation => animation.finished.catch(() => undefined)));
  });
}

/** Open the Save Draft dialog and wait until it has stopped animating in. */
export async function openSaveDraftDialog(page: Page): Promise<Locator> {
  await clickClearOfStickyChrome(page, page.getByRole('button', { name: 'Save Draft' }));
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await waitForAnimationsToSettle(dialog);
  return dialog;
}

/** Name the draft in an open Save Draft dialog, save it, and wait for the dialog to close. */
export async function submitSaveDraftDialog(
  page: Page,
  dialog: Locator,
  title: string
): Promise<void> {
  await dialog.getByLabel('Draft Title').fill(title);
  await clickClearOfStickyChrome(page, dialog.getByRole('button', { name: 'Save Draft' }));
  await expect(dialog).toBeHidden();
}

/**
 * Open, name and save a draft. Callers assert the outcome they care about (the
 * toast, the Load Draft count), so this never hides a product failure behind
 * an expectation of its own.
 */
export async function saveDraftThroughDialog(page: Page, title: string): Promise<void> {
  await submitSaveDraftDialog(page, await openSaveDraftDialog(page), title);
}
