/**
 * A hermetic exhibitor dataset for the PR-smoke UI specs.
 *
 * WHY THIS EXISTS. Three PR-smoke specs assert on `/exhibitor/entries` and
 * only passed while the shared staging project happened to hold seeded demo
 * data. On 2026-09-20 that data was emptied and all three collapsed at once,
 * blocking every open PR on a required check none of them had broken. Rows in
 * a shared database are not a fixture — they are someone else's data that the
 * suite borrowed.
 *
 * WHAT IT REPLACES. Every read `/exhibitor/entries` needs, served from here
 * instead of the network. The specs then assert on layout, filters and dialog
 * geometry — what they are actually about — with no dependency on what the
 * database happens to contain.
 *
 * THE ONE THING TO KNOW. The load-bearing row is `exhibitor_profiles`, not
 * `entries`. Without a profile row carrying `onboarding_completed_at`,
 * `ExhibitorOnboardingChecker` redirects EVERY signed-in exhibitor route to
 * `/onboarding`, so My Shows never mounts and no other fixture below it
 * matters. That single row is what was actually breaking the header,
 * appearance-control and "Clear Cache" specs, none of which read an entry.
 *
 * NOT A SUBSTITUTE FOR THE REAL READ PATH. These specs no longer prove that
 * the app can talk to Supabase. `exhibitorReadPathCanary.spec.ts` owns that
 * question. See docs/plan-hermetic-e2e-fixtures.md.
 */
import type { Page, Route } from '@playwright/test';
import type { Tables } from '@/types/supabase';

/**
 * The demo exhibitor's real identifiers. These stay real on purpose: the
 * fixture replaces the exhibitor's DATA, not their identity — sign-in still
 * goes to Supabase auth, so `auth.uid` is genuine and the RBAC RPCs answer
 * for a real account.
 */
export const FIXTURE_AUTH_USER_ID = '4b63a211-b6bd-4916-b1f9-567f1bebb038';
export const FIXTURE_PERSON_ID = '6fd402f4-88fb-447d-876e-7c6ae3c429d1';

export const FIXTURE_SHOW_ID = 'f1f1f1f1-0000-0000-0000-000000000001';
export const FIXTURE_PAST_SHOW_ID = 'f1f1f1f1-0000-0000-0000-000000000002';
export const FIXTURE_TRIAL_ID = 'f1f1f1f1-0000-0000-0000-000000000011';
export const FIXTURE_CLASS_ID = 'f1f1f1f1-0000-0000-0000-000000000021';
export const FIXTURE_DOG_ID = 'f1f1f1f1-0000-0000-0000-000000000031';

export const FIXTURE_SHOW_NAME = 'Fixture Scent Work Trial';
export const FIXTURE_PAST_SHOW_NAME = 'Fixture Completed Trial';
export const FIXTURE_DOG_CALL_NAME = 'Fixture';

/**
 * Typed against the generated schema so a renamed or dropped column fails
 * `pnpm typecheck` rather than a CI run. Only the columns each query actually
 * selects are declared; the rest of the row is irrelevant to PostgREST, which
 * returns exactly what `select=` asks for.
 */
type ShowRow = Pick<
  Tables<'shows'>,
  'id' | 'name' | 'status' | 'start_date' | 'end_date' | 'deleted_at' | 'organization' | 'style'
>;
// NOTE: `dogs` has no `handler_id`. An earlier draft of this fixture invented
// one and typecheck rejected it — which is the whole argument for typing
// fixture rows against the generated schema rather than hand-writing JSON.
type DogRow = Pick<Tables<'dogs'>, 'id' | 'call_name' | 'breed' | 'owner_id' | 'deleted_at'>;

const NOW = '2026-01-01T00:00:00.000Z';

const SHOW_ROW: ShowRow & Record<string, unknown> = {
  id: FIXTURE_SHOW_ID,
  name: FIXTURE_SHOW_NAME,
  organization: 'AKC',
  style: 'scent_work',
  status: 'published',
  start_date: '2099-01-10',
  end_date: '2099-01-11',
  deleted_at: null,
  brand_color: '#123456',
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
  venue_name: 'Fixture Fairgrounds',
  city: 'Testville',
  state: 'KS',
  entry_close_date: '2098-12-20',
  created_at: NOW,
  updated_at: NOW,
};

const DOG_ROW: DogRow & Record<string, unknown> = {
  id: FIXTURE_DOG_ID,
  call_name: FIXTURE_DOG_CALL_NAME,
  breed: 'Belgian Tervuren',
  owner_id: FIXTURE_PERSON_ID,
  deleted_at: null,
  registered_name: 'Fixture Of The Test Suite',
  version: 1,
  created_at: NOW,
  updated_at: NOW,
};

/**
 * The row that stops the onboarding redirect. `onboarding_completed_at` is the
 * field `useExhibitorProfile` turns `onboardingCompleted` on from, and the
 * `person` key mirrors the embed the query asks for
 * (`person:people!person_id(...)`).
 */
const EXHIBITOR_PROFILE_ROW = {
  id: 'f1f1f1f1-0000-0000-0000-000000000041',
  person_id: FIXTURE_PERSON_ID,
  auth_user_id: FIXTURE_AUTH_USER_ID,
  onboarding_completed_at: NOW,
  created_at: NOW,
  updated_at: NOW,
  person: {
    id: FIXTURE_PERSON_ID,
    first_name: 'Test',
    last_name: 'Exhibitor',
    email: 'exhibitor@myk9t.com',
    phone: null,
    profile_image: null,
  },
};

/**
 * One row of `view_authenticated_entry_results`, shaped exactly as
 * `buildUserEntriesSelect` asks for it — flat columns plus the five embeds
 * (`registration`, `dog`, `show` with nested `trials`, `class` with nested
 * `trial`, and `trial`).
 */
function entryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f1f1f1f1-0000-0000-0000-000000000051',
    dog_id: FIXTURE_DOG_ID,
    show_id: FIXTURE_SHOW_ID,
    class_id: FIXTURE_CLASS_ID,
    trial_id: FIXTURE_TRIAL_ID,
    handler: 'Test Exhibitor',
    handler_id: FIXTURE_PERSON_ID,
    payment_status: 'paid',
    payment_method: 'card',
    entry_status: 'confirmed',
    check_in_status: 'not-checked-in',
    entry_fee: 30,
    armband: 101,
    run_order: 1,
    jump_height: null,
    special_requests: null,
    is_scored: false,
    result_status: null,
    search_time_seconds: null,
    total_faults: null,
    final_placement: null,
    class_results_released_at: null,
    dog_image_url: null,
    deleted_at: null,
    refund_amount: null,
    refunded_at: null,
    submitted_at: NOW,
    created_at: NOW,
    updated_at: NOW,
    registration_id: null,
    registration: null,
    moved_from_entry_id: null,
    withdrawal_reason_code: null,
    registration_confirmation_number: null,
    dog: {
      id: FIXTURE_DOG_ID,
      name: 'Fixture Of The Test Suite',
      call_name: FIXTURE_DOG_CALL_NAME,
      breed: 'Belgian Tervuren',
    },
    show: {
      id: FIXTURE_SHOW_ID,
      name: FIXTURE_SHOW_NAME,
      deleted_at: null,
      status: 'published',
      start_date: '2099-01-10',
      end_date: '2099-01-11',
      entry_close_date: '2098-12-20',
      venue_name: 'Fixture Fairgrounds',
      city: 'Testville',
      state: 'KS',
      trials: [{ id: FIXTURE_TRIAL_ID, date: '2099-01-10', timezone: 'America/Chicago' }],
    },
    class: {
      id: FIXTURE_CLASS_ID,
      name: 'Interior Novice A',
      class_number: 1,
      trial: {
        id: FIXTURE_TRIAL_ID,
        trial_type: 'scent_work',
        date: '2099-01-10',
        trial_number: 1,
        timezone: 'America/Chicago',
      },
    },
    trial: {
      id: FIXTURE_TRIAL_ID,
      trial_type: 'scent_work',
      date: '2099-01-10',
      trial_number: 1,
      timezone: 'America/Chicago',
    },
    ...overrides,
  };
}

async function fulfillRows(route: Route, rows: unknown[]) {
  const count = rows.length;
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'content-range': `0-${Math.max(count - 1, 0)}/${count}` },
    body: JSON.stringify(rows),
  });
}

/** A HEAD count probe wants headers, not a body (LESSONS postgrest-count-column). */
function isCountProbe(route: Route) {
  return route.request().method() === 'HEAD';
}

/**
 * A finished entry on a past show.
 *
 * The default set holds one upcoming and one completed entry ON PURPOSE.
 * `my-entries-page-ui` asserts that Upcoming + Completed sums to All, and
 * with a single upcoming entry that arithmetic reads 1 + 0 === 1 — true for
 * the wrong reason, and it would stay true if the Completed bucket were
 * broken outright.
 */
const COMPLETED_ENTRY_OVERRIDES: Record<string, unknown> = {
  id: 'f1f1f1f1-0000-0000-0000-000000000052',
  show_id: FIXTURE_PAST_SHOW_ID,
  armband: 102,
  entry_status: 'confirmed',
  payment_status: 'paid',
  is_scored: true,
  result_status: 'qualified',
  final_placement: 1,
  search_time_seconds: 42.5,
  total_faults: 0,
  class_results_released_at: '2020-02-02T00:00:00.000Z',
  submitted_at: '2020-01-01T00:00:00.000Z',
  show: {
    id: FIXTURE_PAST_SHOW_ID,
    name: FIXTURE_PAST_SHOW_NAME,
    deleted_at: null,
    status: 'completed',
    start_date: '2020-02-01',
    end_date: '2020-02-02',
    entry_close_date: '2020-01-15',
    venue_name: 'Fixture Fairgrounds',
    city: 'Testville',
    state: 'KS',
    trials: [{ id: FIXTURE_TRIAL_ID, date: '2020-02-01', timezone: 'America/Chicago' }],
  },
};

export interface ExhibitorFixtureOptions {
  /**
   * Entry rows to serve. Defaults to one upcoming and one completed entry.
   * Pass `[]` for the genuine zero state — which is a DIFFERENT assertion from
   * "the database happened to be empty", and specs should be able to ask for
   * it deliberately.
   */
  entries?: Array<Record<string, unknown>>;
}

/**
 * Install the fixture. Call BEFORE signing in: the onboarding redirect fires
 * on the first authenticated render, so a route added afterwards is too late.
 */
export async function installExhibitorFixture(
  page: Page,
  options: ExhibitorFixtureOptions = {}
): Promise<void> {
  const entries = options.entries ?? [entryRow(), entryRow(COMPLETED_ENTRY_OVERRIDES)];

  await page.route('**/rest/v1/exhibitor_profiles*', async route => {
    if (isCountProbe(route)) return fulfillRows(route, []);
    await fulfillRows(route, [EXHIBITOR_PROFILE_ROW]);
  });

  await page.route('**/rest/v1/view_authenticated_entry_results*', async route => {
    if (isCountProbe(route)) return fulfillRows(route, []);
    await fulfillRows(route, entries);
  });

  await page.route('**/rest/v1/shows*', async route => {
    if (isCountProbe(route)) return fulfillRows(route, []);
    await fulfillRows(route, [SHOW_ROW]);
  });

  await page.route('**/rest/v1/dogs*', async route => {
    if (isCountProbe(route)) return fulfillRows(route, []);
    await fulfillRows(route, [DOG_ROW]);
  });
}

export { entryRow };
