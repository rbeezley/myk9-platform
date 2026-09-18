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
 * This runs once per grid-based popup primitive (see `CASES`): `DialogContent`
 * and `AlertDialogContent` carry the SAME guard class, so a single-primitive
 * spec would let a future PR drop the class from the uncovered one with
 * nothing going red. The probe/measure helpers are shared and take the
 * primitive's ARIA role selector, so the two cases are one test body rather
 * than a copy-paste pair.
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
 * probes are appended as DIRECT CHILDREN of the popup, making them grid items
 * of the primitive itself. That contract is what protects the ~40 dialogs
 * carrying no local guard.
 *
 * DATA DEPENDENCY (this spec is in the BLOCKING PR-smoke set): each case needs
 * the demo exhibitor account (`E2E_DEMO_EXHIBITOR_*`) plus whatever that case's
 * `dataDependency` string names. Every trigger lookup below carries that string
 * as its assertion message, so a seed-data change fails with "the demo
 * exhibitor has no entry rendering ..." rather than an opaque locator timeout.
 */

const GUARD_CLASS = 'grid-cols-[minmax(0,1fr)]';

/** Append an unbreakable string and a `w-full` sibling as direct grid items. */
async function addProbes(page: Page, selector: string) {
  await page.evaluate(sel => {
    const popup = document.querySelector(sel) as HTMLElement | null;
    if (!popup) throw new Error(`no ${sel} on the page -- selector drifted`);
    const wide = document.createElement('div');
    wide.id = 'myk9-503-wide-probe';
    wide.textContent = 'x'.repeat(400); // no break opportunity anywhere
    popup.appendChild(wide);
    const full = document.createElement('div');
    full.id = 'myk9-503-full-probe';
    full.style.width = '100%'; // the `w-full` sibling that inherits the track
    popup.appendChild(full);
  }, selector);
}

/** Width of the `w-full` sibling, against the popup's own content width. */
async function measure(page: Page, selector: string) {
  return page.evaluate(sel => {
    const popup = document.querySelector(sel) as HTMLElement | null;
    if (!popup) throw new Error(`no ${sel} on the page`);
    const full = document.getElementById('myk9-503-full-probe');
    if (!full) throw new Error('probe missing');
    return {
      dialogContentWidth: popup.clientWidth,
      siblingWidth: Math.round(full.getBoundingClientRect().width),
      track: getComputedStyle(popup).gridTemplateColumns,
    };
  }, selector);
}

interface DialogCase {
  /** The primitive under test, named as it appears in source. */
  primitive: string;
  /** Source file carrying the guard class this case protects. */
  source: string;
  /** ARIA role selector the primitive renders. */
  selector: string;
  /** Seed data this case's trigger needs; surfaced on failure. */
  dataDependency: string;
  /** Sign in, navigate, and open the popup. */
  open(page: Page): Promise<void>;
}

const CASES: DialogCase[] = [
  {
    primitive: 'DialogContent',
    source: 'src/components/ui/dialog/dialog.tsx',
    selector: '[role="dialog"]',
    dataDependency:
      'the demo exhibitor (E2E_DEMO_EXHIBITOR_*) must have at least one entry on ' +
      '/exhibitor/entries, whose show card renders an "Actions" menu holding ' +
      '"Add to calendar"',
    async open(page) {
      await signInAsExhibitor(page, '/exhibitor/entries');
      // MYK9-631 moved "Add to calendar" from a bare header link into the show
      // card's one Actions menu, so the trigger is now two clicks: the menu,
      // then the item. The Dialog this case needs is the same one.
      const actions = page.getByRole('button', { name: /^Actions for / }).first();
      await expect(
        actions,
        'MISSING SEED DATA, not a dialog regression: no show card on ' +
          '/exhibitor/entries. This spec needs an entry row to obtain an open Dialog; ' +
          'reseed the demo exhibitor or repoint this case at another Dialog trigger.'
      ).toBeVisible();
      await actions.click();
      const trigger = page
        .getByRole('menu')
        .getByRole('menuitem', { name: 'Add to calendar', exact: true });
      await expect(
        trigger,
        'No "Add to calendar" item in the show card Actions menu. It is withheld while ' +
          'the show relation is still replicating (empty showId), so this is seed/replication ' +
          'state rather than a dialog regression.'
      ).toBeVisible();
      await trigger.click();
    },
  },
  {
    primitive: 'AlertDialogContent',
    source: 'src/components/ui/alert-dialog/alert-dialog.tsx',
    selector: '[role="alertdialog"]',
    dataDependency:
      'none beyond a signed-in account -- /account?section=data renders "Clear Cache" for ' +
      'every user. The confirm dialog opens only when the device has no unsynced mutations, ' +
      'which is always true in a fresh browser context.',
    async open(page) {
      await signInAsExhibitor(page, '/account?section=data');
      const trigger = page.getByRole('button', { name: 'Clear Cache', exact: true });
      await expect(
        trigger,
        'no "Clear Cache" button on /account?section=data. This spec needs it to obtain an ' +
          'open AlertDialog; the Storage section or its section param has moved.'
      ).toBeVisible();
      await trigger.click();
      // Never confirmed: the action clears local storage and reloads. The
      // dialog is opened only to measure the primitive's grid track.
    },
  },
];

test.describe('dialogs contain long unbreakable content', () => {
  for (const testCase of CASES) {
    test(`a long string cannot widen a w-full sibling past ${testCase.primitive}`, async ({
      page,
    }) => {
      await testCase.open(page);

      const popup = page.locator(testCase.selector);
      await expect(
        popup,
        `${testCase.primitive} never opened (${testCase.selector}). Data dependency: ` +
          testCase.dataDependency
      ).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await addProbes(page, testCase.selector);

      // Measure the SHIPPED state first, before touching anything. An earlier
      // draft ran the control first and then re-added the class before this
      // measurement -- which made the assertion measure a class the test had
      // just injected, so it passed with the fix reverted. Order matters: the
      // real state is observed while it is still the real state.
      const guarded = await measure(page, testCase.selector);

      // Positive control: with the guard removed the sibling must blow out.
      // Without this, a harness that can never see the defect -- a drifted
      // selector, a dialog that never opened, a probe that wraps -- reports a
      // clean pass on the very regression it exists to catch
      // (LESSONS #measurement-harness). It runs second and is never undone.
      await page.evaluate(
        ([sel, cls]) => {
          document.querySelector(sel)?.classList.remove(cls);
        },
        [testCase.selector, GUARD_CLASS]
      );
      const unguarded = await measure(page, testCase.selector);
      expect(
        unguarded.siblingWidth,
        `positive control: with ${GUARD_CLASS} removed from ${testCase.primitive} the w-full sibling ` +
          `should inherit the long string's width, but it measured ${unguarded.siblingWidth}px against a ` +
          `${unguarded.dialogContentWidth}px dialog (track ${unguarded.track}). ` +
          'The measurement is broken -- the clean result above would be meaningless.'
      ).toBeGreaterThan(unguarded.dialogContentWidth * 2);
      expect(
        guarded.siblingWidth,
        `a w-full child rendered ${guarded.siblingWidth}px inside a ${guarded.dialogContentWidth}px ` +
          `${testCase.primitive} (track ${guarded.track}). The guard ${GUARD_CLASS} is missing from ` +
          testCase.source
      ).toBeLessThanOrEqual(guarded.dialogContentWidth);
    });
  }
});
