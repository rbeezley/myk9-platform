import { expect, test } from '@playwright/test';
import { signInAsExhibitor } from '../helpers/testUsers';
import { installSharedStagingWriteGuard } from '../helpers/sharedStagingWriteGuard';
import { LIVE_REGISTRATION_SHOW_ID } from '../uat/shared/seededShows';

const showPath = `/shows/${LIVE_REGISTRATION_SHOW_ID}`;
const entryPath = `${showPath}/register`;

test('browser Back leaves an entry that can be resumed at the saved step', async ({ page }) => {
  await installSharedStagingWriteGuard(page, { strictRpcWrites: true });
  await signInAsExhibitor(page, showPath);
  await page.goto(entryPath);

  const dog = page.getByRole('checkbox', { name: /^Select / }).first();
  await expect(dog).toBeVisible();
  const dogName = await dog.getAttribute('aria-label');
  await dog.click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Select Classes', exact: true })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${showPath}$`));
  await page.goto(entryPath);
  await expect(page.getByRole('button', { name: 'Resume entry' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume entry' }).click();
  await expect(page.getByRole('heading', { name: 'Select Classes', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: dogName!, exact: true })).toBeChecked();
});
