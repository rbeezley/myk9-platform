import type { Browser } from '@playwright/test';
import type { ResolvedLoadTarget } from './loadTarget';

export async function assertApplicationTarget(
  browser: Browser,
  target: ResolvedLoadTarget
): Promise<void> {
  const context = await browser.newContext({
    baseURL: target.baseUrl,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();

  try {
    await page.goto('/shows', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const declaredOrigin = await page
      .locator('meta[name="myk9-supabase-origin"]')
      .getAttribute('content');
    if (!declaredOrigin) {
      throw new Error('Application target did not declare its Supabase identity.');
    }
    const origin = new URL(declaredOrigin).origin;
    if (origin !== target.supabaseUrl) {
      throw new Error('Application and approved Supabase targets do not match.');
    }
  } finally {
    await context.close();
  }
}
