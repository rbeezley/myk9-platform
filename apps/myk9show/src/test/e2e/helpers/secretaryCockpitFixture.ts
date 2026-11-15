/**
 * The secretary show fixture plus what the Overview cockpit waits on. Without an entries read the
 * cockpit stays on "Entry counts are loading" and renders no schedule, so a spec that needs the
 * focused-class panel serves the show's entries here, empty unless asked (read-only, like the base
 * fixture).
 */
import type { Page } from '@playwright/test';
import { fulfillRows, isRead } from './postgrestRoute';
import {
  installSecretaryFixture,
  SECRETARY_FIXTURE_CLASS_IDS,
  SECRETARY_FIXTURE_SHOW_ID,
  SECRETARY_FIXTURE_TRIAL_ID,
  type SecretaryFixtureOptions,
} from './secretaryFixture';

const STAMP = '2026-01-01T00:00:00.000Z';

/** `count` confirmed, unchecked entries in the first fixture class, in armband order. */
function firstClassEntries(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const n = String(index + 1).padStart(12, '0');
    const callName = `Dog ${index + 1}`;
    return {
      id: `f1f1f1f1-0000-0000-0001-${n}`,
      class_id: SECRETARY_FIXTURE_CLASS_IDS[0],
      show_id: SECRETARY_FIXTURE_SHOW_ID,
      trial_id: SECRETARY_FIXTURE_TRIAL_ID,
      dog_id: `f1f1f1f1-0000-0000-0002-${n}`,
      armband: String(101 + index),
      entry_status: 'confirmed',
      check_in_status: 'no-status',
      payment_status: 'paid',
      entry_fee: 30,
      dog_call_name: callName,
      dog_breed: 'Belgian Tervuren',
      dogs: { call_name: callName, breed: 'Belgian Tervuren', owner_id: null },
      deleted_at: null,
      version: 1,
      created_at: STAMP,
      updated_at: STAMP,
    };
  });
}

/**
 * `extraClasses` lengthens the schedule so a spec can scroll it beside the focused class;
 * `entries` puts that many entries in the first class (MYK9-1989), none by default.
 */
export async function installSecretaryCockpitFixture(
  page: Page,
  options: Pick<SecretaryFixtureOptions, 'extraClasses' | 'extraTrials'> & { entries?: number } = {}
): Promise<void> {
  const { entries = 0, ...fixtureOptions } = options;
  await installSecretaryFixture(page, fixtureOptions);
  const rows = firstClassEntries(entries);
  // The entries replica pulls `entries` and the results view; both serve the same rows.
  for (const table of ['entries', 'view_authenticated_entry_results_replication']) {
    await page.route(`**/rest/v1/${table}{,?*}`, async route => {
      if (!isRead(route)) {
        await route.abort('blockedbyclient');
        return;
      }
      await fulfillRows(route, rows);
    });
  }
  // An empty replica is only believed once the server confirms the show's live entry count.
  await page.route('**/rest/v1/rpc/get_secretary_live_entry_count', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: String(rows.length) })
  );
}
