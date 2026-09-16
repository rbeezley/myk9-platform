import { expect, test, type Locator, type Page } from '@playwright/test';
import { signInAsAdmin } from './helpers/testUsers';

/**
 * Base UI's Radio.Root and Checkbox.Root render a <span>, which is display:inline.
 * Before the inline-flex fix the indicator was laid out as inline content on the text
 * baseline. Measured in Chromium against the pre-fix build:
 *   - radio dot sat 2px high in its 16x16 control (dy -2)
 *   - row checkbox check sat 1px low, squeezed to 14x16, overflowing by 1px
 *   - the dogs-table select-all checkbox stretched to its header cell: 25.0x61
 *
 * A class-string assertion would certify a no-op here (LESSONS source-text-tests),
 * so this measures rendered geometry.
 *
 * NOTHING in this spec may persist state: it signs in as the SHARED e2e admin, and a
 * write here changes every other admin-authed spec. So it only ever drives controls
 * whose checked state is client-side — the dogs-table selection and the change-status
 * dialog (which commits on Save, never on select) — and never touches the appearance
 * radios, which upsert user_preferences on click and rescale the whole app.
 */
// Tolerances are RATIOS of the control's own rendered size, never absolute pixels: a
// dialog's entry animation scales its subtree and getBoundingClientRect reports the
// transformed box, and the app rescales rem units from a stored font-size preference.
// Both would make a pixel literal wrong without anything being visually broken.
const MAX_OFFSET_RATIO = 0.05; // 5% of the control's width
const MAX_SQUARENESS_RATIO = 0.05;

type Geometry = {
  dx: number;
  dy: number;
  overflow: number;
  controlWidth: number;
  controlHeight: number;
  indicatorWidth: number;
  indicatorHeight: number;
};

/**
 * Reads only once the box has SETTLED: `keepMounted={false}` mounts the indicator a
 * tick after aria-checked flips, and a dialog animates its scale in over several
 * frames. Requiring two consecutive identical reads means a mount or animation race
 * is a retry, never a failure and never a measurement of an in-between frame.
 *
 * On timeout it reports the last raw observation, so a control that is present but
 * mis-sized does not masquerade as a missing indicator.
 */
async function readIndicatorGeometry(control: Locator, label: string): Promise<Geometry> {
  let last: Geometry | null = null;
  let previous: Geometry | null = null;
  let seen = 'nothing';

  const read = async (): Promise<Geometry | null> =>
    control.evaluate(el => {
      const indicator = el.querySelector('svg');
      const c = el.getBoundingClientRect();
      if (!indicator) return null;
      const i = indicator.getBoundingClientRect();
      if (c.width === 0 || c.height === 0 || i.width === 0 || i.height === 0) return null;
      return {
        dx: i.left + i.width / 2 - (c.left + c.width / 2),
        dy: i.top + i.height / 2 - (c.top + c.height / 2),
        overflow: Math.max(c.left - i.left, c.top - i.top, i.right - c.right, i.bottom - c.bottom),
        controlWidth: c.width,
        controlHeight: c.height,
        indicatorWidth: i.width,
        indicatorHeight: i.height,
      };
    });

  await expect
    .poll(
      async () => {
        const current = await read();
        if (current === null) {
          // Distinguish "no indicator" from "no control" for the failure message.
          const box = await control.evaluate(el => {
            const r = el.getBoundingClientRect();
            return `${r.width}x${r.height}, svg=${el.querySelector('svg') !== null}`;
          });
          seen = `control ${box}`;
          previous = null;
          return false;
        }
        seen = `control ${current.controlWidth}x${current.controlHeight}, indicator ${current.indicatorWidth}x${current.indicatorHeight}`;
        const settled =
          previous !== null &&
          Math.abs(previous.controlWidth - current.controlWidth) < 0.01 &&
          Math.abs(previous.dy - current.dy) < 0.01;
        previous = current;
        last = current;
        return settled;
      },
      {
        message: `${label}: geometry never settled — last saw ${seen}`,
        timeout: 10_000,
        intervals: [100, 100, 150, 250, 500],
      }
    )
    .toBe(true);

  return last as unknown as Geometry;
}

/**
 * Four independent properties, none implying another: the control is square (a root
 * laid out inline stretched to its table cell, 25x61), the indicator is square, the
 * indicator is centred, and it stays inside the control — an oversized icon centres
 * perfectly while overflowing on all four sides.
 */
async function expectIndicatorCentered(control: Locator, label: string): Promise<void> {
  const g = await readIndicatorGeometry(control, label);
  const detail =
    `${label}: control ${g.controlWidth}x${g.controlHeight}, ` +
    `indicator ${g.indicatorWidth}x${g.indicatorHeight}`;
  const tolerance = g.controlWidth * MAX_OFFSET_RATIO;

  expect(
    Math.abs(g.controlWidth - g.controlHeight),
    `${detail} — control is not square`
  ).toBeLessThanOrEqual(g.controlWidth * MAX_SQUARENESS_RATIO);
  expect(
    Math.abs(g.indicatorWidth - g.indicatorHeight),
    `${detail} — indicator is not square`
  ).toBeLessThanOrEqual(g.controlWidth * MAX_SQUARENESS_RATIO);
  expect(Math.abs(g.dx), `${detail} — horizontal offset ${g.dx}px`).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(g.dy), `${detail} — vertical offset ${g.dy}px`).toBeLessThanOrEqual(tolerance);
  expect(
    g.overflow,
    `${detail} — indicator overflows the control by ${g.overflow}px`
  ).toBeLessThanOrEqual(tolerance);
}

async function openFirstDog(page: Page): Promise<void> {
  await page.goto('/dogs', { waitUntil: 'domcontentloaded' });
  const firstRow = page.locator('table tbody tr').first();
  await expect(firstRow).toBeVisible({ timeout: 30_000 });
  await firstRow.click();
  await expect(page).toHaveURL(/\/dogs\/[0-9a-f-]{36}/, { timeout: 30_000 });
}

test.describe('radio and checkbox indicator centering', () => {
  test('dogs table checkboxes center their check mark inside the control', async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto('/dogs', { waitUntil: 'domcontentloaded' });

    // The select-all checkbox lives in a table header cell, where an inline-laid-out
    // root stretched to fill the cell instead of holding its declared box.
    const selectAll = page.getByRole('checkbox', { name: 'Select all dogs' });
    await expect(selectAll).toBeVisible({ timeout: 30_000 });

    // Negative control: unchecked renders no indicator, so a geometry read here would
    // time out rather than pass vacuously. Selection is component state — nothing persists.
    await expect(selectAll).toHaveAttribute('aria-checked', 'false');
    await selectAll.click();
    await expect(selectAll).toHaveAttribute('aria-checked', 'true');

    await expectIndicatorCentered(selectAll, 'select-all checkbox (table header)');

    const rowCheckboxes = page.getByRole('checkbox', { name: /^Select (?!all dogs)/ });
    const rows = await rowCheckboxes.count();
    expect(rows, 'expected seeded dogs to render row checkboxes').toBeGreaterThan(0);

    for (let index = 0; index < Math.min(rows, 3); index += 1) {
      const rowCheckbox = rowCheckboxes.nth(index);
      await expect(rowCheckbox).toHaveAttribute('aria-checked', 'true');
      await expectIndicatorCentered(rowCheckbox, `row checkbox #${index}`);
    }

    // Leave the page as we found it, so a later spec on this shared account does not
    // inherit a selection or the bulk-actions bar it mounts.
    await selectAll.click();
    await expect(selectAll).toHaveAttribute('aria-checked', 'false');
  });

  test('change-status dialog radios center their dot inside the control', async ({ page }) => {
    await signInAsAdmin(page);
    await openFirstDog(page);

    await page.getByRole('button', { name: 'More actions' }).first().click();
    await page
      .getByRole('menuitem', { name: /status/i })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    // The dialog seeds a checked radio from the dog's current status.
    const checked = dialog.locator('[role="radio"][aria-checked="true"]');
    await expect(checked).toHaveCount(1);
    await expectIndicatorCentered(checked.first(), 'change-status radio (seeded)');

    // The indicator mounts on check, so a radio checked at runtime is a distinct case.
    // Selecting here only sets dialog state; Cancel below commits nothing.
    // Located by role, never by `#status-retired`: Base UI puts the caller's `id` on
    // its own hidden input, so an id selector matches the input, not the control.
    const retired = dialog.getByRole('radio', { name: /retired/i });
    await expect(retired).toHaveAttribute('aria-checked', 'false');
    await retired.click();
    await expect(retired).toHaveAttribute('aria-checked', 'true');
    await expectIndicatorCentered(retired, 'change-status radio (checked at runtime)');

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });
});
