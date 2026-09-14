import { test, expect, type Page } from '@playwright/test';
import { signInAsExhibitor } from './helpers/testUsers';

/**
 * A long unbreakable string must not widen a dialog's other children.
 *
 * DialogContent is `grid` with no column template. A grid item's implicit
 * column is sized `auto`, whose minimum is min-content, so one unbreakable
 * string sizes the column to that string's width and every `w-full` sibling
 * inherits it. Measured before the fix (MYK9-503): the dialog stayed 448px
 * while "Subscribe in my calendar" rendered 1253px, 830px past the right edge.
 *
 * What this asserts, and what it deliberately does NOT:
 *
 * - The BOX is not the symptom. `w-full max-w-*` on a fixed-position element
 *   always resolves to a definite width, so the dialog measures the same
 *   before and after. Asserting its width proves nothing.
 * - Raw scroll overflow is not the symptom either. `grid-cols-[minmax(0,1fr)]`
 *   bounds the grid TRACK, not the glyphs: an unbreakable string still
 *   overflows its own block box and the dialog still scrolls. Measured here:
 *   ~3000px of scrollWidth overflow with the guard on AND off. Asserting
 *   "no overflow" would fail on correct code.
 * - The track width IS the mechanism, and a `w-full` sibling is where it
 *   becomes user-visible. Measured here: that sibling is 398px with the guard
 *   and 3419px without it. That is what this spec measures.
 *
 * Asserting the class string instead (`toHaveClass('grid-cols-[...]')`) cannot
 * see any of this: jsdom loads no Tailwind and performs no layout, so such a
 * test passes whether or not the utility is emitted, and goes red on an
 * equivalent fix using different classes (LESSONS #source-text-tests).
 *
 * Probe nodes rather than real content: every dialog rendering a URL today
 * carries its own `min-w-0` / `truncate` scaffolding at the call site, so none
 * can demonstrate the primitive -- they are defended twice over, and stripping
 * those guards to make a test fail would damage the app to serve the test. The
 * probes are appended as DIRECT CHILDREN of DialogContent, making them grid
 * items of the primitive itself. That contract is what protects the ~40
 * dialogs carrying no local guard.
 */

const GUARD_CLASS = 'grid-cols-[minmax(0,1fr)]';

/** Append an unbreakable string and a `w-full` sibling as direct grid items. */
async function addProbes(page: Page) {
  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
    if (!dialog) throw new Error('no [role="dialog"] on the page -- selector drifted');
    const wide = document.createElement('div');
    wide.id = 'myk9-503-wide-probe';
    wide.textContent = 'x'.repeat(400); // no break opportunity anywhere
    dialog.appendChild(wide);
    const full = document.createElement('div');
    full.id = 'myk9-503-full-probe';
    full.style.width = '100%'; // the `w-full` sibling that inherits the track
    dialog.appendChild(full);
  });
}

/** Width of the `w-full` sibling, against the dialog's own content width. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
    if (!dialog) throw new Error('no [role="dialog"] on the page');
    const full = document.getElementById('myk9-503-full-probe');
    if (!full) throw new Error('probe missing');
    return {
      dialogContentWidth: dialog.clientWidth,
      siblingWidth: Math.round(full.getBoundingClientRect().width),
      track: getComputedStyle(dialog).gridTemplateColumns,
    };
  });
}

test.describe('dialogs contain long unbreakable content', () => {
  test('a long string cannot widen a w-full sibling past the dialog', async ({ page }) => {
    await signInAsExhibitor(page, '/exhibitor/entries');

    const trigger = page.getByRole('button', { name: 'Add to calendar', exact: true }).first();
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await addProbes(page);

    // Measure the SHIPPED state first, before touching anything. An earlier
    // draft ran the control first and then re-added the class before this
    // measurement -- which made the assertion measure a class the test had
    // just injected, so it passed with the fix reverted. Order matters: the
    // real state is observed while it is still the real state.
    const guarded = await measure(page);

    // Positive control: with the guard removed the sibling must blow out.
    // Without this, a harness that can never see the defect -- a drifted
    // selector, a dialog that never opened, a probe that wraps -- reports a
    // clean pass on the very regression it exists to catch
    // (LESSONS #measurement-harness). It runs second and is never undone.
    await page.evaluate(cls => {
      document.querySelector('[role="dialog"]')?.classList.remove(cls);
    }, GUARD_CLASS);
    const unguarded = await measure(page);
    expect(
      unguarded.siblingWidth,
      `positive control: with ${GUARD_CLASS} removed the w-full sibling should inherit the long string's width, ` +
        `but it measured ${unguarded.siblingWidth}px against a ${unguarded.dialogContentWidth}px dialog (track ${unguarded.track}). ` +
        'The measurement is broken -- the clean result above would be meaningless.'
    ).toBeGreaterThan(unguarded.dialogContentWidth * 2);
    expect(
      guarded.siblingWidth,
      `a w-full child rendered ${guarded.siblingWidth}px inside a ${guarded.dialogContentWidth}px dialog (track ${guarded.track})`
    ).toBeLessThanOrEqual(guarded.dialogContentWidth);
  });
});
