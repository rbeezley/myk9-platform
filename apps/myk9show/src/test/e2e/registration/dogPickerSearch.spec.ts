import { expect, test } from '@playwright/test';
import { signInAsExhibitor } from '../helpers/testUsers';
import { installSharedStagingWriteGuard } from '../helpers/sharedStagingWriteGuard';
const REGISTRATION_SHOW_ID = 'a1090000-0000-0000-0010-100000000001';

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`dog search preserves selection and drafts at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await installSharedStagingWriteGuard(page, { strictRpcWrites: true });
    await signInAsExhibitor(page, `/shows/${REGISTRATION_SHOW_ID}/register`);
    const search = page.getByRole('textbox', { name: 'Search dogs by call name' });
    await expect(search).toBeVisible();
    const dogs = page.getByRole('checkbox', { name: /^Select / });
    await expect(dogs).toHaveCount(252);
    const lastLabel = await dogs.last().getAttribute('aria-label');
    expect(lastLabel).toBeTruthy();
    const callName = lastLabel!.replace(/^Select /, '');
    await search.fill(callName);
    const dog = page.getByRole('checkbox', { name: lastLabel!, exact: true });
    await expect(dog).toBeVisible();
    for (const control of [search, dog, page.getByRole('button', { name: 'Clear search' })]) {
      const box = await control.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await dog.focus();
    await page.keyboard.press('Space');
    await expect(dog).toBeChecked();
    await search.fill('no-matching-dog-myk9-369');
    await expect(page.getByText(/No dogs match your search/)).toBeVisible();
    await expect(page.getByText('1 dog selected')).toBeVisible();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await search.fill(callName);
    await expect(dog).toBeChecked();
    await page.screenshot({ path: testInfo.outputPath('filtered-selection.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false
    );
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await search.fill(callName);
    await expect(dog).toBeChecked();
    await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
    await page.getByLabel('Draft Title').fill('MYK9-369 search selection');
    await page.getByRole('dialog').getByRole('button', { name: 'Save Draft', exact: true }).click();
    await dog.click();
    await expect(dog).not.toBeChecked();
    await page.getByRole('button', { name: /Load Draft \(/ }).click();
    await page.getByText('MYK9-369 search selection', { exact: true }).click();
    await page.getByRole('button', { name: 'Load Selected Draft' }).click();
    await search.fill(callName);
    await expect(dog).toBeChecked();
  });
}
