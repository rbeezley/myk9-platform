import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { signInAsExhibitor } from './helpers/testUsers';

/**
 * PHASE 1 SPIKE — not part of any suite (docs/plan-hermetic-e2e-fixtures.md).
 *
 * Two questions the source cannot answer, because `/exhibitor/entries` is
 * offline-first and what reaches the network is decided by the replication
 * layer rather than by the page's hooks:
 *
 *   1. Which Supabase reads does the page actually issue?
 *   2. Does replication accept a synthesized PostgREST payload, or does it
 *      reject it and render the "pending first sync" empty state — which
 *      looks exactly like the bug we are trying to remove?
 *
 * Run: pnpm exec playwright test src/test/e2e/exhibitorReadPathCapture.spec.ts
 */

function recordSupabaseTraffic(page: Page, seen: string[]) {
  page.on('request', request => {
    const url = request.url();
    if (!url.includes('supabase.co')) return;
    seen.push(`${request.method()} ${url.replace(/^https:\/\/[^/]+/, '')}`);
  });
}

function reportTraffic(seen: string[]) {
  const rest = seen.filter(line => line.includes('/rest/v1/'));
  console.log('\n===== REST (%d unique of %d) =====', new Set(rest).size, rest.length);
  for (const line of [...new Set(rest)].sort()) console.log(line.slice(0, 160));

  const tables = new Set<string>();
  for (const line of rest) {
    const match = /\/rest\/v1\/([^?/]+)/.exec(line);
    if (match) tables.add(match[1]);
  }
  console.log('\n===== TABLES TOUCHED =====');
  for (const table of [...tables].sort()) console.log(table);
}

test('capture the exhibitor entries read path', async ({ page }) => {
  const seen: string[] = [];
  recordSupabaseTraffic(page, seen);

  await signInAsExhibitor(page, '/exhibitor/entries');
  await page.waitForLoadState('networkidle');
  // The replication layer syncs after first paint; give it room to issue the
  // reads the page's empty state would otherwise hide.
  await page.waitForTimeout(5000);

  reportTraffic(seen);
});

// ---------------------------------------------------------------------------
// Seam proof: serve ONE synthesized show and see whether (a) it survives
// replication into the UI and (b) the show-scoped entries read then fires.
// The capture above touches no `entries` endpoint at all, because entry sync
// is per-show and there are no visible shows on the empty database.
// ---------------------------------------------------------------------------

const SHOW_ID = 'f1f1f1f1-0000-0000-0000-000000000001';

/** Only the columns this spike needs; the typed factories land in Phase 2. */
const SHOW_ROW = {
  id: SHOW_ID,
  name: 'Fixture Scent Work Trial',
  organization: 'AKC',
  style: 'scent_work',
  brand_color: '#123456',
  start_date: '2099-01-10',
  end_date: '2099-01-11',
  status: 'published',
  deleted_at: null,
  version: 1,
  is_nationals: false,
  default_judge_day_capacity: 100,
  starting_armband_number: 1,
  waitlist_payment_deadline_hours: 48,
  accept_cash_payments: false,
  accept_check_payments: false,
  cc_secretary_on_exhibitor_emails: false,
  experience_is_published: false,
  experience_published_content: {},
  mail_in_auto_release: false,
  updated_at: '2026-01-01T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
};

async function fulfillJson(route: Route, body: unknown, rowCount: number) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'content-range': `0-${Math.max(rowCount - 1, 0)}/${rowCount}` },
    body: JSON.stringify(body),
  });
}

/** The demo exhibitor's real `people.id`, confirmed by a signed-in probe. */
const PERSON_ID = '6fd402f4-88fb-447d-876e-7c6ae3c429d1';

const DOG_ROW = {
  id: 'd09d09d0-0000-0000-0000-000000000001',
  call_name: 'Fixture',
  breed: 'Belgian Tervuren',
  registered_name: 'Fixture Of The Test Suite',
  owner_id: PERSON_ID,
  handler_id: PERSON_ID,
  deleted_at: null,
  version: 1,
  updated_at: '2026-01-01T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
};

test('a synthesized show survives replication and triggers the entries read', async ({ page }) => {
  const seen: string[] = [];
  const consoleErrors: string[] = [];
  recordSupabaseTraffic(page, seen);
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 200));
  });

  await page.route('**/rest/v1/shows*', async route => {
    if (route.request().method() === 'HEAD') return fulfillJson(route, [], 1);
    await fulfillJson(route, [SHOW_ROW], 1);
  });
  await page.route('**/rest/v1/dogs*', async route => {
    if (route.request().method() === 'HEAD') return fulfillJson(route, [], 1);
    await fulfillJson(route, [DOG_ROW], 1);
  });

  await signInAsExhibitor(page, '/exhibitor/entries');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);

  reportTraffic(seen);

  console.log('\n===== CONSOLE ERRORS (%d) =====', consoleErrors.length);
  for (const line of [...new Set(consoleErrors)].slice(0, 15)) console.log(line);

  const heading = await page.getByRole('heading', { level: 1 }).first().textContent();
  console.log('\n===== H1 ===== %s', heading);
  const body =
    (await page
      .locator('main')
      .first()
      .innerText()
      .catch(() => '')) || '';
  console.log('\n===== MAIN TEXT (first 600) =====\n%s', body.slice(0, 600));

  const entriesReads = seen.filter(
    line => line.includes('/rest/v1/entries') || line.includes('view_authenticated_entry_results')
  );
  console.log('\n===== ENTRIES/VIEW READS: %d =====', entriesReads.length);
  for (const line of entriesReads) console.log(line.slice(0, 200));

  // The seam question, asserted rather than eyeballed: if replication drops
  // the synthesized row, no show-scoped entries read is ever issued.
  expect(
    entriesReads.length,
    'replication did not accept the synthesized show row — no show-scoped ' +
      'entries read was issued, so seam 1 (intercept PostgREST) cannot carry ' +
      'the fixture and the plan must fall back to seam 2 (seed IndexedDB).'
  ).toBeGreaterThan(0);
});
