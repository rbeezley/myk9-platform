import { expect, test, type Page } from '@playwright/test';
import { signInAsAdmin } from '../helpers/testUsers';

const runbook = 'https://github.com/rbeezley/myk9-platform/blob/main/docs/operations/START-HERE.md';

/** Real admin auth/route guard; deterministic read-only health responses. */
async function fixtureHealth(page: Page) {
  const now = new Date().toISOString();
  await page.route('**/rest/v1/operator_alerts*', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    })
  );
  await page.route('**/rest/v1/system_health_snapshots*', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: '10000000-0000-4000-8000-000000000409',
          created_at: now,
          source: 'cron-health-check',
          overall_status: 'fail',
          run_duration_ms: 35,
          checks: [
            ...['anon_grants', 'applied_acl_grants', 'public_schema_create_acl'].map(key => ({
              key,
              label: key,
              status: 'fail',
              detail: 'Controlled local ACL fixture; no database grant changed.',
              checked_at: now,
              verification: 'proven',
              stale_after_ms: 172800000,
            })),
            {
              key: 'payout_ledger',
              label: 'Payout ledger',
              status: 'fail',
              detail: 'Controlled internal-link fixture.',
              checked_at: now,
              verification: 'proven',
              stale_after_ms: 600000,
            },
          ],
        },
      ]),
    })
  );
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
]) {
  test(`admin health recovery links at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signInAsAdmin(page);
    await fixtureHealth(page);
    for (const surface of ['health', 'dashboard']) {
      await page.goto(`/admin/${surface}`);
      if (surface === 'health')
        await page.getByRole('button', { name: /public_schema_create_acl/ }).click();
      const link = page
        .getByRole('link', {
          name: 'Open Database Access Runbook (opens in a new tab)',
          exact: true,
        })
        .first();
      await expect(link).toHaveAttribute('href', runbook);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noreferrer');
      await link.focus();
      const popupPromise = page.waitForEvent('popup');
      await page.keyboard.press('Enter');
      const popup = await popupPromise;
      await expect(popup).toHaveURL(runbook);
      await popup.close();
      if (surface === 'health') await page.getByRole('button', { name: /Payout ledger/ }).click();
      await page.evaluate(() => {
        (window as unknown as Record<string, unknown>).__healthNavigationProbe = true;
      });
      await page.getByRole('link', { name: 'Open Payouts', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/admin\/payouts$/);
      expect(
        await page.evaluate(
          () => (window as unknown as Record<string, unknown>).__healthNavigationProbe
        )
      ).toBe(true);
    }
  });
}
