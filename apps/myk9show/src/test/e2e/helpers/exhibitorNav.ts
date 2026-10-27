import type { Locator, Page } from '@playwright/test';

/**
 * The exhibitor's navigation, wherever the viewport puts it: the desktop rail (`nav "Main"`), or
 * on phones the header drawer, opened first (it carries no dialog role). Exhibitor-only accounts
 * have My Shows and My Dogs as their own items in both (MYK9-1287), so the nav holding the My Dogs
 * link is the one to use.
 */
export async function exhibitorNav(page: Page): Promise<Locator> {
  const opener = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await opener.isVisible()) await opener.click();
  const nav = page
    .getByRole('navigation')
    .filter({ has: page.getByRole('link', { name: 'My Dogs', exact: true }) })
    .first();
  await nav.waitFor({ state: 'visible' });
  return nav;
}
