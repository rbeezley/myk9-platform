import { expect, test } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';
import { installSecretaryCockpitFixture } from '../helpers/secretaryCockpitFixture';
import { measureEntries, scrollToEntries } from '../helpers/showDeskEntriesGeometry';
import {
  SECRETARY_FIXTURE_CLASS_IDS,
  SECRETARY_FIXTURE_SHOW_ID,
} from '../helpers/secretaryFixture';

/**
 * MYK9-1989: on a laptop, Show Desk's pinned headers leave room for the selected class's
 * entries. Before, the pinned stack (Shows row, show header, tabs, and the whole class card with
 * its settings) left one entry row on screen. Now only the class's name line pins and the Shows
 * button sits in the show header, so working down a class shows at least six dogs, the first in
 * the upper half of the window, with the class's name still visible.
 *
 * Hermetic: the fixture show serves reads (twelve entries in the focused class) and aborts writes.
 * Extra classes make the schedule taller than the window, so the page can scroll the class panel
 * up to where it pins.
 */
test.setTimeout(90000);

for (const { width, height } of [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
]) {
  test(`${width}x${height}: six entries show under the pinned class name`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await installSecretaryCockpitFixture(page, { extraClasses: 14, entries: 12 });
    await signInAsSecretary(page, '/');
    await page.goto(`/shows/${SECRETARY_FIXTURE_SHOW_ID}?focus=${SECRETARY_FIXTURE_CLASS_IDS[0]}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Container Novice A' })).toBeVisible({
      timeout: 60000,
    });
    await expect(page.getByRole('complementary').locator('tbody tr')).toHaveCount(12);
    await expect(page.getByTestId('focused-class-header')).toHaveCSS('position', 'sticky');

    await scrollToEntries(page);
    const geometry = await measureEntries(page);

    expect(geometry.rowCount).toBe(12);
    expect(geometry.nameVisible).toBe(true);
    // The first entry row's top is in the upper half of the window.
    expect(geometry.firstRowTop).toBeLessThan(geometry.viewportHeight / 2);
    // And it is the entries, not the header, that start there: the row sits below the pinned line.
    expect(geometry.firstRowTop).toBeGreaterThanOrEqual(geometry.headerBottom);
    expect(geometry.rowsVisible).toBeGreaterThanOrEqual(6);

    // Nothing was deleted to make the room: the settings are one scroll up, in the same card.
    const settings = page.getByTestId('focused-class-settings');
    for (const label of ['Status', 'Expected start', 'Actual timing']) {
      await expect(settings.getByText(label, { exact: true })).toBeAttached();
    }
  });
}

test('1280x800: the folded Shows list keeps its button, in the show header', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await installSecretaryCockpitFixture(page, { extraClasses: 14, entries: 12 });
  await signInAsSecretary(page, '/');
  await page.goto(`/shows/${SECRETARY_FIXTURE_SHOW_ID}?focus=${SECRETARY_FIXTURE_CLASS_IDS[0]}`);
  // Until the show loads, the button waits on its own row (the page has no header to take it).
  await expect(page.getByRole('heading', { level: 2, name: 'Container Novice A' })).toBeVisible({
    timeout: 60000,
  });
  const shows = page.getByRole('button', { name: 'Shows', exact: true });
  await expect(shows).toBeVisible();
  await expect(shows).toHaveCount(1);
  // Inline with the show's name, not on a row of its own above it.
  const name = page.getByRole('heading', { level: 1 });
  const [button, title] = [await shows.boundingBox(), await name.boundingBox()];
  expect(
    button && title && button.y < title.y + title.height && title.y < button.y + button.height
  ).toBe(true);
  await shows.click();
  await expect(page.getByRole('region', { name: 'Shows list' })).toBeVisible();
});
