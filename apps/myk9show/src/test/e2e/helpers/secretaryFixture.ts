/**
 * A hermetic show for the secretary PR-smoke specs.
 *
 * WHY THIS EXISTS. `uat/secretary/critical-path` (mail-in registration) and
 * `uat/secretary/qa-regression-proof` (add trials) opened the seeded show
 * `dededede-…0010`. When staging was emptied on 2026-09-20 that show went with
 * it: the mail-in page rendered "Show not found." and the add-trials wizard
 * "We couldn't open this show". CI never showed it — every post-wipe run hit
 * the E2E job's time cap retrying the exhibitor specs first, so these two sat
 * behind them unobserved (docs/plan-hermetic-e2e-fixtures.md).
 *
 * WHAT IT REPLACES. The show and its trial, classes and judges, plus the dog
 * the mail-in search finds. Identity stays REAL, as in the exhibitor fixture:
 * the secretary signs in for real, and the show is owned by whichever club
 * the live `get_user_roles` answer scopes them to. That club differs between
 * shared staging and the nightly isolated database, so it is read, never
 * hard-coded (Codex review, #2392).
 * `useShowManageScope` then grants management exactly as it would in
 * production, instead of the fixture forging a permission.
 *
 * READ-ONLY. Every route below serves reads and aborts writes, so a spec that
 * wanders into a save fails loudly instead of writing into a club's real data.
 */
import type { Page, Route } from '@playwright/test';
import type { Tables } from '@/types/supabase';
import { fulfillRows, isRead } from './postgrestRoute';
import { awaitIdentity, deferred, installExhibitorProfile } from './exhibitorProfileRoute';

export const SECRETARY_FIXTURE_SHOW_ID = 'f1f1f1f1-0000-0000-0000-000000000101';
const TRIAL_ID = 'f1f1f1f1-0000-0000-0000-000000000111';
const CLASS_IDS = [
  'f1f1f1f1-0000-0000-0000-000000000121',
  'f1f1f1f1-0000-0000-0000-000000000122',
] as const;
const NON_OWNED_DOG_ID = 'f1f1f1f1-0000-0000-0000-000000000131';
const NON_OWNED_OWNER_ID = 'f1f1f1f1-0000-0000-0000-000000000141';

export const SECRETARY_FIXTURE_SHOW_NAME = 'Fixture Secretary Scent Work Trial';
/** Call name of the dog the mail-in search finds; not owned by the secretary. */
export const NON_OWNED_DOG_CALL_NAME = 'Echo';
/** What the mail-in spec types to find it. */
export const NON_OWNED_DOG_SEARCH = 'Echo 10';

type ShowRow = Pick<
  Tables<'shows'>,
  | 'id'
  | 'name'
  | 'club_id'
  | 'organization'
  | 'status'
  | 'start_date'
  | 'end_date'
  | 'entry_open_date'
  | 'entry_close_date'
  | 'deleted_at'
>;
type TrialRow = Pick<
  Tables<'trials'>,
  'id' | 'show_id' | 'name' | 'date' | 'trial_number' | 'timezone' | 'registry_id' | 'status'
>;
type ClassRow = Pick<
  Tables<'classes'>,
  'id' | 'trial_id' | 'name' | 'level' | 'element' | 'entry_fee' | 'max_entries' | 'status'
>;
// `dogs.name` is the registered name; there is no `registered_name` column
// (that lives on `dog_registrations`). A draft of this fixture put the name
// there, in the untyped tail of the row, and the picker never saw it.
type DogRow = Pick<
  Tables<'dogs'>,
  'id' | 'call_name' | 'name' | 'breed' | 'owner_id' | 'deleted_at'
>;

const STAMP = '2026-01-01T00:00:00.000Z';
const DAY_MS = 86_400_000;

function isoDate(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The show's first day, `YYYY-MM-DD`: 30 days after today (UTC). Exported
 * because the add-trials date picker opens on this date, and a spec asserting
 * on the picker must compare against IT, not against today. In December it
 * falls in next year (Codex review, #2392).
 */
export function secretaryFixtureShowStartDate(): string {
  const todayUtc = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  return isoDate(todayUtc + 30 * DAY_MS);
}

/**
 * Dates relative to the REAL clock, so the fixture never ages out:
 * - the show starts on {@link secretaryFixtureShowStartDate};
 * - entries opened on 2026-01-01, before the mail-in spec's pinned clock
 *   (2026-05-15), and close a week before the show, so that pinned moment is
 *   always inside the entry window.
 */
function showDates() {
  const start = Date.parse(`${secretaryFixtureShowStartDate()}T00:00:00.000Z`);
  return {
    start_date: isoDate(start),
    end_date: isoDate(start + DAY_MS),
    entry_open_date: '2026-01-01T00:00:00.000Z',
    entry_close_date: `${isoDate(start - 7 * DAY_MS)}T00:00:00.000Z`,
  };
}

function buildRows(clubId: string) {
  const dates = showDates();

  const trial: TrialRow & Record<string, unknown> = {
    id: TRIAL_ID,
    show_id: SECRETARY_FIXTURE_SHOW_ID,
    name: 'Trial 1',
    date: dates.start_date,
    trial_number: '1',
    timezone: 'America/Chicago',
    registry_id: 'AKC',
    status: 'planned',
    trial_type: 'scent_work',
    event_number: '2026000001',
    pipeline_stage: 0,
    deleted_at: null,
    version: 1,
    created_at: STAMP,
    updated_at: STAMP,
  };

  const classes: Array<ClassRow & Record<string, unknown>> = [
    { id: CLASS_IDS[0], name: 'Container Novice A', element: 'Container' },
    { id: CLASS_IDS[1], name: 'Interior Novice A', element: 'Interior' },
  ].map((c, index) => ({
    ...c,
    trial_id: TRIAL_ID,
    level: 'Novice',
    section: 'A',
    competition_type: 'regular',
    entry_fee: 30,
    max_entries: 50,
    allow_waitlist: true,
    status: 'setup',
    status_source: 'manual',
    display_order: index,
    deleted_at: null,
    version: 1,
    created_at: STAMP,
    updated_at: STAMP,
  }));

  const show: ShowRow & Record<string, unknown> = {
    id: SECRETARY_FIXTURE_SHOW_ID,
    name: SECRETARY_FIXTURE_SHOW_NAME,
    club_id: clubId,
    organization: 'AKC',
    style: 'scent_work',
    status: 'published',
    ...dates,
    deleted_at: null,
    location: 'Fixture Fairgrounds, Testville, KS',
    venue_name: 'Fixture Fairgrounds',
    city: 'Testville',
    state: 'KS',
    pre_entry_fee: 30,
    brand_color: '#123456',
    version: 1,
    is_nationals: false,
    allow_non_owner_handlers: true,
    default_judge_day_capacity: 100,
    starting_armband_number: 100,
    waitlist_payment_deadline_hours: 48,
    accept_cash_payments: false,
    accept_check_payments: false,
    cc_secretary_on_exhibitor_emails: false,
    experience_is_published: false,
    experience_published_content: {},
    mail_in_auto_release: false,
    created_at: STAMP,
    updated_at: STAMP,
  };

  const dog: DogRow & Record<string, unknown> = {
    id: NON_OWNED_DOG_ID,
    call_name: NON_OWNED_DOG_CALL_NAME,
    // The spec types the whole "Echo 10" and the picker matches it as one
    // substring, so it must sit in a field the picker reads.
    name: NON_OWNED_DOG_SEARCH,
    breed: 'Belgian Tervuren',
    owner_id: NON_OWNED_OWNER_ID,
    deleted_at: null,
    sex: 'female',
    version: 1,
    created_at: STAMP,
    updated_at: STAMP,
    // The embeds `searchAllDogs` selects. Owned by someone other than the
    // secretary: finding a NON-owned dog is what the mail-in case proves.
    owner: {
      id: NON_OWNED_OWNER_ID,
      first_name: 'Fixture',
      last_name: 'Owner',
      email: null,
      phone: null,
    },
    registrations: [],
  };

  // The show-detail read embeds trials -> class, club and judge_assignments
  // (`reads.postgrest.ts`); the replication pulls ask for plain rows. Serving
  // the embedded shape to both is harmless: extra keys are ignored by the
  // replication mappers and needed by `mapDatabaseToShow`.
  const showWithEmbeds = {
    ...show,
    club: {
      id: clubId,
      name: 'Fixture Kennel Club',
      address: null,
      phone: null,
      email: null,
      website: null,
      logo_url: null,
      cover_image_url: null,
      accent_color: null,
    },
    trials: [{ ...trial, class: classes }],
    judge_assignments: [],
  };

  return { showWithEmbeds, trial, classes, dog };
}

async function serve(route: Route, rows: unknown[]) {
  if (!isRead(route)) {
    await route.abort('blockedbyclient');
    return;
  }
  // A HEAD count probe gets the same rows; `fulfillRows` sets the
  // content-range header it reads (LESSONS postgrest-count-column).
  await fulfillRows(route, rows);
}

/**
 * Install the fixture. Call BEFORE signing in: the replication layer pulls
 * `shows`, `trials` and `classes` on the first authenticated render.
 */
export async function installSecretaryFixture(page: Page): Promise<void> {
  // The club the live role read scopes this secretary to.
  const club = deferred<string>();
  page.on('response', async response => {
    if (!response.url().includes('/rest/v1/rpc/get_user_roles')) return;
    const roles = (await response.json().catch(() => [])) as Array<{
      role_name?: string;
      scope_type?: string;
      scope_id?: string | null;
    }>;
    const scope = roles.find(
      r => r.role_name === 'secretary' && r.scope_type === 'club' && r.scope_id
    );
    if (scope?.scope_id) club.resolve(scope.scope_id);
  });
  const rows = club.promise.then(buildRows);
  const serveBuilt = async (route: Route, pick: (built: Awaited<typeof rows>) => unknown[]) => {
    const built = await awaitIdentity(route, rows, "the secretary's club scope");
    if (built) await serve(route, pick(built));
  };

  // Not for the onboarding redirect, which a secretary is exempt from, but for
  // `useCurrentPersonId`: without this row the dog roster never loads and the
  // mail-in wizard cannot resolve the owner of the dog it just found.
  await installExhibitorProfile(page);

  await page.route('**/rest/v1/shows?*', route => serveBuilt(route, b => [b.showWithEmbeds]));
  await page.route('**/rest/v1/trials?*', route => serveBuilt(route, b => [b.trial]));
  await page.route('**/rest/v1/classes?*', route => serveBuilt(route, b => b.classes));
  await page.route('**/rest/v1/dogs?*', route => serveBuilt(route, b => [b.dog]));
  // `searchAllDogs` resolves registration matches first and folds the ids into
  // the dog query; served empty, so the name match alone must find the dog.
  await page.route('**/rest/v1/dog_registrations?*', route => serve(route, []));
}
