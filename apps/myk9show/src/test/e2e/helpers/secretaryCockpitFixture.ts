/**
 * The secretary show fixture plus what the Overview cockpit waits on. Without an entries read the
 * cockpit stays on "Entry counts are loading" and renders no schedule, so a spec that needs the
 * focused-class panel serves the show's entries empty here (read-only, like the base fixture).
 */
import type { Page } from '@playwright/test';
import { fulfillRows, isRead } from './postgrestRoute';
import { installSecretaryFixture } from './secretaryFixture';

/** `extraClasses` lengthens the schedule so a spec can scroll it beside the focused class. */
export async function installSecretaryCockpitFixture(
  page: Page,
  options: { extraClasses?: number } = {}
): Promise<void> {
  await installSecretaryFixture(page, options);
  // The entries replica pulls `entries` and the results view; both served empty.
  for (const table of ['entries', 'view_authenticated_entry_results_replication']) {
    await page.route(`**/rest/v1/${table}{,?*}`, async route => {
      if (!isRead(route)) {
        await route.abort('blockedbyclient');
        return;
      }
      await fulfillRows(route, []);
    });
  }
  // An empty replica is only believed once the server confirms the show really has no entries.
  await page.route('**/rest/v1/rpc/get_secretary_live_entry_count', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '0' })
  );
}
