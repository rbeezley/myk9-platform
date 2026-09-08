import { expect, test } from '@playwright/test';
import { signIn, TEST_USERS } from './helpers/testUsers';

// Manual acceptance replay: real signed-in page, isolated address/geo responses.
// Run with MYK9_LOCATION_FALLBACK_REPLAY=1 VITE_GEO_API_ENABLED=true.
// No shared profile is edited. Public show reads use the existing fixture data.
test('signed-in empty profile falls back to a labelled approximate city', async ({ page }) => {
  test.skip(process.env.MYK9_LOCATION_FALLBACK_REPLAY !== '1', 'Manual MYK9-427 acceptance replay');
  let profileReads = 0;
  let approximateReads = 0;
  let deviceRequests = 0;
  await page.exposeFunction('recordLocationRequest', () => {
    deviceRequests += 1;
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: () => {
          void (
            window as unknown as { recordLocationRequest: () => Promise<void> }
          ).recordLocationRequest();
        },
      },
    });
  });
  await page.route('**/rest/v1/people?**', async route => {
    const url = new URL(route.request().url());
    if (
      route.request().method() === 'GET' &&
      url.searchParams.get('select') === 'city,state,zip_code'
    ) {
      expect(url.searchParams.get('id')).toMatch(/^eq\..+/);
      profileReads += 1;
      await route.fulfill({ json: { city: null, state: null, zip_code: null } });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/geo*', async route => {
    expect(new URL(route.request().url()).searchParams.has('q')).toBe(false);
    approximateReads += 1;
    await route.fulfill({
      json: { label: 'Fixture City, OK', lat: 36.15, lng: -95.99, approximate: true },
    });
  });

  const account = TEST_USERS.DEMO_EXHIBITOR;
  await signIn(page, account.email, account.password, '/shows');
  await expect(
    page.getByRole('button', { name: 'Near: Fixture City, OK (approximate)' })
  ).toBeVisible();
  expect(profileReads).toBeGreaterThan(0);
  expect(approximateReads).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: /Distance/ })).toBeVisible();
  await expect(page.getByText(/\b\d[\d,]* mi\b/).first()).toBeVisible();
  expect(deviceRequests).toBe(0);
  await page.screenshot({ path: '../../.logs/myk9-427-approximate.png', fullPage: true });

  await page.getByRole('button', { name: 'Near: Fixture City, OK (approximate)' }).click();
  await page.getByRole('button', { name: 'Anywhere', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Near: Anywhere' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Near: Anywhere' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Distance/ })).toHaveCount(0);
  expect(deviceRequests).toBe(0);
});
