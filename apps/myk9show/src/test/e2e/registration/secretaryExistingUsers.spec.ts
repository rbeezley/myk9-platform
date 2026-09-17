import { test, expect, type Page } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';
import { LIVE_REGISTRATION_SHOW_ID } from '../uat/shared/seededShows';
import { installSharedStagingWriteGuard } from '../helpers/sharedStagingWriteGuard';
import { applyRegistrationClock } from './seedRoster';

const SHOW_ID = process.env.QA_EXISTING_USER_REGISTRATION_SHOW_ID ?? LIVE_REGISTRATION_SHOW_ID;
// Both from `supabase/seed-demo.sql` section 5, and they must have DIFFERENT
// owners for the multi-exhibitor guard to fire. Willow belongs to
// exhibitor@myk9t.com and Cooper to secretary@myk9t.com. This used to name
// Scout, which the seed also moved onto exhibitor@myk9t.com — the two dogs then
// shared an owner and the guard had nothing to block (MYK9-545).
const PRIMARY_DOG = 'Willow';
const OTHER_EXHIBITOR_DOG = 'Cooper';

async function gotoRegistration(page: Page) {
  await page.goto(`/secretary/register/${SHOW_ID}`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });
  await expect(page.getByRole('heading', { name: 'Add mail-in entry' })).toBeVisible({
    timeout: 15000,
  });
}

async function searchDog(page: Page, name: string) {
  const search = page.getByPlaceholder(/Search all dogs/i);
  await search.fill(name);
  await page.waitForResponse(
    response =>
      response.url().includes('/rest/v1/dogs') &&
      response.request().method() === 'GET' &&
      response.url().toLowerCase().includes(name.toLowerCase()),
    { timeout: 10000 }
  );
  // The response landing is not the row landing. Wait for the rendered result
  // before clicking, or the click lands on the previous (unfiltered) list.
  await expect(selectDog(page, name)).toBeVisible({ timeout: 10000 });
}

/**
 * MYK9-545: these rows used to be clicked via `getByText(name, { exact: true })
 * .last()`. The secretary picker renders a TABLE, whose name cell is not the
 * toggle, so the click silently selected nothing; and `.last()` is a coin flip
 * once staging carries more than one dog with that call name. Anchor to the
 * row's own checkbox instead.
 */
function selectDog(page: Page, name: string) {
  return page.getByRole('checkbox', { name: new RegExp(`^Select ${name}$`, 'i') });
}

test.describe('Secretary registration for existing users', () => {
  test.beforeEach(async ({ page }) => {
    // MYK9-545: this spec now really selects dogs, where before its text click
    // silently selected nothing. Its siblings all install the guard; make the
    // "no shared-staging writes" claim true by construction here too.
    await installSharedStagingWriteGuard(page, { strictRpcWrites: true });
    // The seed's entry window is relative to the reseed date
    // (CURRENT_DATE - 16 .. + 76), so a pinned absolute date expires.
    await applyRegistrationClock(page);
    await signInAsSecretary(page, '/secretary/dashboard');
    await gotoRegistration(page);
  });

  test('renders secretary-mode search and keeps Next disabled until a dog is selected', async ({
    page,
  }) => {
    await expect(page.getByRole('heading', { name: 'Select Dogs to Register' })).toBeVisible();
    await expect(page.getByPlaceholder(/Search all dogs/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Next/ })).toBeDisabled();

    await searchDog(page, PRIMARY_DOG);
    await selectDog(page, PRIMARY_DOG).click();
    await expect(page.getByText(/1 selected/).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /^Next/ })).toBeEnabled();
  });

  test('blocks existing-user carts that span multiple exhibitors', async ({ page }) => {
    await searchDog(page, PRIMARY_DOG);
    await selectDog(page, PRIMARY_DOG).click();

    await searchDog(page, OTHER_EXHIBITOR_DOG);
    await selectDog(page, OTHER_EXHIBITOR_DOG).click();

    await expect(page.getByText(/2 selected/).first()).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText(/wizard processes one exhibitor.*entries at a time/i)
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^Next/ })).toBeDisabled();
  });
});
