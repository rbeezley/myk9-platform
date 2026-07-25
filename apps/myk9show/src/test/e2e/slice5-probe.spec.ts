/** Throwaway probe — does the entries payload carry entry_fee? */
import { test } from '@playwright/test';
import { signInAsTestUser } from './helpers/testUsers';

test('probe entries payload', async ({ page }) => {
  test.setTimeout(120_000);

  const seen: string[] = [];
  page.on('response', async res => {
    const url = res.url();
    if (!/\/rest\/v1\/entries/.test(url)) return;
    try {
      const body = await res.json();
      const rows = Array.isArray(body) ? body : [body];
      if (!rows.length) return;
      seen.push(
        `URL ${url.slice(0, 160)}\n  keys=${JSON.stringify(Object.keys(rows[0]))}\n  entry_fee=${JSON.stringify(rows.slice(0, 6).map((r: Record<string, unknown>) => r.entry_fee))}`
      );
    } catch {
      /* non-JSON */
    }
  });

  await signInAsTestUser(page, 'DEMO_EXHIBITOR');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/my-entries');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(4000);

  console.log('=== entries responses:', seen.length);
  for (const s of seen.slice(0, 6)) console.log('===\n' + s);
});
