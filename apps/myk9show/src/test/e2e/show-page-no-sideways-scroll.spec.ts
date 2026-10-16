import { expect, test } from '@playwright/test';
import { installSharedStagingWriteGuard } from './helpers/sharedStagingWriteGuard';
import { signInAsExhibitor } from './helpers/testUsers';
import { expectNoHorizontalOverflow } from './helpers/horizontalOverflow';

/**
 * The exhibitor's show page must not pan sideways on a phone (MYK9-1192).
 * At 390x844 `/shows/<id>` measured scrollWidth 455. The tab strip scrolls
 * inside its own overflow-x-auto container; the real culprit was a schedule
 * row (WhereToBe) whose non-shrinking result chip pushed its chevron to x=455.
 * Only rendered geometry can see this.
 */

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const PHONE = { width: 390, height: 844 } as const;

test('exhibitor show page has no horizontal scroll at 390px (MYK9-1192)', async ({ page }) => {
  await installSharedStagingWriteGuard(page, { strictRpcWrites: true });
  await page.setViewportSize(PHONE);
  await signInAsExhibitor(page, `/shows/${SHOW_ID}`);
  await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(1500);
  // Positive control: without a rendered schedule row the width check proves nothing.
  await expect(page.getByRole('heading', { name: 'Where to be & when' })).toBeVisible();
  await expect(page.getByLabel(/^Armband /).first()).toBeVisible();

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
    'document scrollWidth must fit the 390px viewport'
  ).toBeLessThanOrEqual(PHONE.width);
  await expectNoHorizontalOverflow(page, 'exhibitor show page');
});
