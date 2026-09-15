import { expect, test, type Locator, type Page } from '@playwright/test';
import { signInAsAdmin } from './helpers/testUsers';

/**
 * Base UI's Radio.Root and Checkbox.Root render a <span>, which is display:inline.
 * Before the inline-flex fix the indicator was laid out as inline content on the text
 * baseline: the radio dot sat 2px high, the row checkbox's check sat 1px low and was
 * squeezed to 14x16, and the select-all checkbox stretched to its table header cell
 * (25x61 instead of 16x16).
 *
 * A class-string assertion would certify a no-op here, so measure rendered geometry.
 * Measured on origin/main before the fix: radio dy -2, row checkbox dy +1 overflow +1.
 */
const MAX_OFFSET_PX = 0.75;
const CONTROL_SIZE_PX = 16;
const MAX_SIZE_DRIFT_PX = 0.75;

async function readIndicatorGeometry(control: Locator) {
  return control.evaluate(el => {
    const indicator = el.querySelector('svg');
    if (!indicator) throw new Error('control renders no indicator svg — it is not checked');
    const c = el.getBoundingClientRect();
    const i = indicator.getBoundingClientRect();
    if (c.width === 0 || c.height === 0) throw new Error('control has no rendered box');
    if (i.width === 0 || i.height === 0) throw new Error('indicator has no rendered box');
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
}

/**
 * Three independent properties, none of which implies another: the control keeps its
 * declared 16x16 box, the indicator is centred in it, and the indicator stays inside
 * it — a 16px icon in the 14px content box left by the 1px border centres perfectly
 * while overflowing on all four sides.
 */
async function expectIndicatorCentered(control: Locator, label: string): Promise<void> {
  const g = await readIndicatorGeometry(control);
  const detail =
    `${label}: control ${g.controlWidth}x${g.controlHeight}, ` +
    `indicator ${g.indicatorWidth}x${g.indicatorHeight}`;

  expect(
    Math.abs(g.controlWidth - CONTROL_SIZE_PX),
    `${detail} — control width drifted from ${CONTROL_SIZE_PX}px`
  ).toBeLessThanOrEqual(MAX_SIZE_DRIFT_PX);
  expect(
    Math.abs(g.controlHeight - CONTROL_SIZE_PX),
    `${detail} — control height drifted from ${CONTROL_SIZE_PX}px`
  ).toBeLessThanOrEqual(MAX_SIZE_DRIFT_PX);
  expect(
    Math.abs(g.indicatorWidth - g.indicatorHeight),
    `${detail} — indicator is not square`
  ).toBeLessThanOrEqual(MAX_SIZE_DRIFT_PX);

  expect(Math.abs(g.dx), `${detail} — horizontal offset ${g.dx}px`).toBeLessThanOrEqual(
    MAX_OFFSET_PX
  );
  expect(Math.abs(g.dy), `${detail} — vertical offset ${g.dy}px`).toBeLessThanOrEqual(
    MAX_OFFSET_PX
  );
  expect(
    g.overflow,
    `${detail} — indicator overflows the control by ${g.overflow}px`
  ).toBeLessThanOrEqual(MAX_OFFSET_PX);
}

async function openAppearanceSection(page: Page): Promise<void> {
  await page.goto('/account?section=appearance', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Layout Density' })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe('radio and checkbox indicator centering', () => {
  test('appearance radios center their dot inside the control', async ({ page }) => {
    await signInAsAdmin(page);
    await openAppearanceSection(page);

    const checkedRadios = page.locator('[role="radio"][aria-checked="true"]');
    await expect(checkedRadios.first()).toBeVisible();

    // The page renders a theme, a density and a font-size group; a locator that
    // silently matched none would pass every assertion below, so pin the count.
    const total = await checkedRadios.count();
    expect(total, 'expected a checked radio in each appearance group').toBeGreaterThanOrEqual(3);

    for (let index = 0; index < total; index += 1) {
      await expectIndicatorCentered(checkedRadios.nth(index), `checked radio #${index}`);
    }

    // The indicator mounts on check, so a radio checked at runtime is a distinct case.
    const spacious = page.getByRole('radio', { name: 'Spacious' });
    await expect(spacious).toHaveAttribute('aria-checked', 'false');
    await spacious.click();
    await expect(spacious).toHaveAttribute('aria-checked', 'true');
    await expectIndicatorCentered(spacious, 'density radio checked at runtime (Spacious)');
  });

  test('dogs table checkboxes center their check mark inside the control', async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto('/dogs', { waitUntil: 'domcontentloaded' });

    // The select-all checkbox lives in a table header cell, where an inline-laid-out
    // root stretched to the cell instead of holding its 16x16 box.
    const selectAll = page.getByRole('checkbox', { name: 'Select all dogs' });
    await expect(selectAll).toBeVisible({ timeout: 30_000 });
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
  });
});
