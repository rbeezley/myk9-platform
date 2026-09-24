import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { captureRestAuth, dataAbsent, requireRead, type RestAuth } from './helpers/liveCanary';
import {
  installSharedStagingWriteGuard,
  summarizeSharedStagingWriteLedger,
  type SharedStagingWriteLedgerEntry,
} from './helpers/sharedStagingWriteGuard';
import { signInAsExhibitor, signInAsSecretary } from './helpers/testUsers';

/**
 * Walk regression canaries (MYK9-730).
 *
 * The secretary and exhibitor task walks re-verify fixed findings by hand once
 * a week. A fact they verified can regress the next day and nothing notices
 * until the next walk: MYK9-381 was verified fixed on 2026-09-06, a migration
 * dropped the column it read on 2026-09-12, and every exhibitor schedule row
 * read "Judge TBD" again (MYK9-494). Its unit test ran on mocked rows and
 * could not see the dropped column.
 *
 * Each test here pins ONE walk-verified, user-visible fact against LIVE data:
 *
 * 1. Find a qualifying row with a ground-truth read made as the signed-in user,
 *    independent of the app's own derivation. No seed ids: the target may be
 *    shared staging (real club data) or the disposable seeded database.
 * 2. No qualifying row → `dataAbsent` (skip on shared staging, fail on the
 *    seeded Playwright Regression run).
 * 3. Otherwise the page must state the same fact, or the test fails.
 *
 * Read-only: every test installs the shared-staging write guard, and every
 * ground-truth read is a GET or a read-only RPC. New candidates arrive in the
 * walk reports' "Canary candidates" section; see docs/qa/e2e-suite-map.md.
 */

const SHOWS_TO_PROBE = 8;

async function guardAndCapture(page: Page) {
  const ledger: SharedStagingWriteLedgerEntry[] = [];
  await installSharedStagingWriteGuard(page, { ledger });
  const auth = captureRestAuth(page);
  return { ledger, auth };
}

/** A write the guard had to abort is worth seeing, but it is not this canary's verdict. */
function annotateBlockedWrites(ledger: SharedStagingWriteLedgerEntry[]) {
  if (ledger.length === 0) return;
  test.info().annotations.push({
    type: 'shared-staging-writes-blocked',
    description: JSON.stringify(summarizeSharedStagingWriteLedger(ledger)),
  });
}

/** What a passing canary actually checked, so a green run is evidence, not a claim. */
function noteChecked(description: string) {
  test.info().annotations.push({ type: 'checked', description });
}

const inList = (ids: readonly string[]) => `in.(${ids.join(',')})`;
const unique = <T>(values: readonly T[]) => [...new Set(values)];

// ---------------------------------------------------------------------------
// MYK9-494 / MYK9-381 (E39): a confirmed judge must never render "Judge TBD".
// ---------------------------------------------------------------------------

interface ShowJudgeRow {
  assignment_id: string;
  class_id: string | null;
  first_name: string | null;
  last_name: string | null;
  status: string;
}

/** The app's rule (judgeNamesByClass.ts): confirmed, per class, lowest assignment id. */
function confirmedJudgeNames(rows: readonly ShowJudgeRow[]): Map<string, string> {
  const byClass = new Map<string, ShowJudgeRow>();
  for (const row of rows) {
    if (row.status !== 'confirmed' || !row.class_id) continue;
    const name = [row.first_name, row.last_name].filter(Boolean).join(' ');
    if (!name) continue;
    const held = byClass.get(row.class_id);
    if (!held || row.assignment_id < held.assignment_id) byClass.set(row.class_id, row);
  }
  return new Map(
    [...byClass].map(([classId, row]) => [
      classId,
      [row.first_name, row.last_name].filter(Boolean).join(' '),
    ])
  );
}

test('exhibitor schedule shows the confirmed judge, never "Judge TBD" (MYK9-494)', async ({
  page,
}) => {
  const { ledger, auth: capture } = await guardAndCapture(page);
  await signInAsExhibitor(page, '/exhibitor/entries');
  const auth = await capture.get();

  const own = await requireRead<{ show_id: string }>(
    page,
    auth,
    'view_authenticated_entry_results?select=show_id&is_own_entry=is.true&deleted_at=is.null'
  );
  let target: { showId: string; judges: Map<string, string> } | undefined;
  for (const showId of unique(own.map(row => row.show_id)).slice(0, SHOWS_TO_PROBE)) {
    const rows = await requireRead<ShowJudgeRow>(page, auth, 'rpc/get_show_judges', {
      p_show_id: showId,
    });
    const judges = confirmedJudgeNames(rows);
    if (judges.size > 0) {
      target = { showId, judges };
      break;
    }
  }
  if (!target) dataAbsent('no show the demo exhibitor entered has a confirmed, named judge');

  await page.goto(`/shows/${target.showId}?tab=overview`);
  await expect(page.getByRole('heading', { name: 'Show schedule' })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByTestId('compact-schedule-skeleton')).toHaveCount(0, { timeout: 30000 });
  // Trial groups past the first of each day start collapsed; open them all.
  // Their toggles read "Expand <trial> on <Weekday, Month D, YYYY>" and flip to
  // "Collapse …" once open. Bounded, so a toggle that stops flipping fails
  // instead of spinning.
  const expanders = page.getByRole('button', { name: /^Expand .+ on \w+day, / });
  for (let opened = 0; (await expanders.count()) > 0; opened += 1) {
    expect(opened, 'a schedule trial group would not stay expanded').toBeLessThan(40);
    await expanders.first().click();
  }
  // An instant count() read of rows still mounting is zero, and zero here
  // means "skip as data-absent": the same empty-read trap judgeRead exists
  // for. Wait until the rendered class rows exist and their count holds.
  const classRows = page.locator('a[aria-label^="Open "][href*="/classes/"]');
  let settled = -1;
  await expect
    .poll(
      async () => {
        const now = await classRows.count();
        const stable = now > 0 && now === settled;
        settled = now;
        return stable;
      },
      { timeout: 30000, intervals: [500], message: 'the schedule never rendered its class rows' }
    )
    .toBe(true);

  const checked: string[] = [];
  for (const [classId, judgeName] of target.judges) {
    // At most six rows render per trial, so a judged class may legitimately be
    // behind "View N more classes". Only a rendered row is a claim.
    const row = page.locator(`a[href$="/classes/${classId}"]`).first();
    if ((await row.count()) === 0) continue;
    await expect(
      row,
      `class ${classId} has a confirmed judge, ${judgeName}; its schedule row must name them`
    ).toContainText(judgeName);
    await expect(row).not.toContainText('Judge TBD');
    checked.push(classId);
  }
  if (checked.length === 0) {
    dataAbsent(`none of show ${target.showId}'s judged classes is among the rendered rows`);
  }
  noteChecked(`${checked.length} judged class row(s) on show ${target.showId}`);
  annotateBlockedWrites(ledger);
});

// ---------------------------------------------------------------------------
// MYK9-495 (E38): an entry that is owed must never be reported as paid.
// ---------------------------------------------------------------------------

interface OwnMoneyRow {
  entry_status: string | null;
  payment_status: string | null;
  payment_method: string | null;
  entry_fee: number | string | null;
  moved_from_entry_id: string | null;
  registration: { payment_status: string | null } | null;
}

// A deliberately narrow subset of what the balance counts (entryBalanceSummary),
// so every row here is owed under any reading of the rule: no move-ups, no
// waived/secretary-paid methods, no status the adapter might remap.
const OWED_ENTRY_STATUSES = new Set([
  'confirmed',
  'accepted',
  'scheduled',
  'submitted',
  'pending',
  'completed',
]);
const OWED_METHODS = new Set([null, 'online', 'cash', 'check']);

function isUnambiguouslyOwed(row: OwnMoneyRow): boolean {
  return (
    OWED_ENTRY_STATUSES.has((row.entry_status ?? '').trim().toLowerCase()) &&
    row.payment_status === 'pending' &&
    Number(row.entry_fee) > 0 &&
    OWED_METHODS.has(row.payment_method) &&
    row.moved_from_entry_id === null
  );
}

const cents = (text: string) => Math.round(Number(text.replace(/[$,]/g, '')) * 100);

test('an owed entry is never reported as paid on My Shows or My Payments (MYK9-495)', async ({
  page,
}) => {
  const { ledger, auth: capture } = await guardAndCapture(page);
  await signInAsExhibitor(page, '/exhibitor/entries');
  const auth = await capture.get();

  const rows = await requireRead<OwnMoneyRow>(
    page,
    auth,
    'view_authenticated_entry_results?select=entry_status,payment_status,payment_method,' +
      'entry_fee,moved_from_entry_id,registration:registration_id(payment_status)' +
      '&is_own_entry=is.true&deleted_at=is.null'
  );
  const owed = rows.filter(isUnambiguouslyOwed);
  if (owed.length === 0) dataAbsent('the demo exhibitor has no pending entry with a fee');
  const owedCents = owed.reduce((sum, row) => sum + Math.round(Number(row.entry_fee) * 100), 0);
  // The exact MYK9-495 shape: a pending entry inside an order marked paid.
  const masked = owed.filter(row => row.registration?.payment_status === 'paid').length;
  test.info().annotations.push({
    type: 'owed-entries',
    description: `${owed.length} owed (${owedCents} cents), ${masked} inside an order marked paid`,
  });

  const feeButton = page.getByTestId('entry-fee-balance').getByRole('button', {
    name: /^Entry fees:/,
  });
  await expect(feeButton, 'My Shows never confirmed a balance, so it hid the fee card').toBeVisible(
    { timeout: 30000 }
  );
  await expect(
    feeButton,
    `${owed.length} own entries are pending with a fee, so the fee card must show money due`
  ).toHaveAccessibleName(/^Entry fees: \$[\d,]+\.\d{2} (due|outstanding)/);

  await page.goto('/exhibitor/payments');
  const heading = page.getByRole('heading', { name: 'Amount due' });
  await expect(heading, 'My Payments never showed an Amount due figure').toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByText('Current entries are paid up.')).toHaveCount(0);
  const amount = heading.locator('xpath=following-sibling::p[1]');
  await expect(amount).toHaveText(/^\$[\d,]+\.\d{2}$/);
  const shownCents = cents((await amount.textContent()) ?? '');
  expect(
    shownCents,
    `Amount due must cover at least the ${owedCents} cents these pending entries owe`
  ).toBeGreaterThanOrEqual(owedCents);
  annotateBlockedWrites(ledger);
});

// ---------------------------------------------------------------------------
// MYK9-498 (E41, E3): the Waitlist filter, its chip and the positions agree.
// ---------------------------------------------------------------------------

function jwtSubject(bearer: string): string {
  const payload = JSON.parse(Buffer.from(bearer.split('.')[1] ?? '', 'base64url').toString());
  return String(payload.sub);
}

test('the Waitlist filter lists every waiting position its chip counts (MYK9-498)', async ({
  page,
}) => {
  const { ledger, auth: capture } = await guardAndCapture(page);
  await signInAsExhibitor(page, '/exhibitor/entries');
  const auth = await capture.get();

  const profiles = await requireRead<{ id: string }>(
    page,
    auth,
    `exhibitor_profiles?select=id&auth_user_id=eq.${jwtSubject(auth.bearer)}`
  );
  if (profiles.length === 0) dataAbsent('the demo exhibitor has no exhibitor_profiles row');
  // The same filter the app reads positions with (useMyWaitlistEntries).
  const positions = await requireRead<{ id: string }>(
    page,
    auth,
    `waitlist_entries?select=id&exhibitor_id=${inList(profiles.map(p => p.id))}` +
      '&status=in.(waiting,offered)'
  );
  if (positions.length === 0) dataAbsent('the demo exhibitor holds no wait list position');
  const count = positions.length;

  await page.goto('/exhibitor/entries?status=waitlist&tab=all');
  await expect(
    page.getByRole('region', { name: /^Waitlist offer for / }),
    `the database holds ${count} waiting position(s); each must be listed`
  ).toHaveCount(count, { timeout: 30000 });
  await expect(
    page.getByTestId('entries-filter-section').getByRole('status'),
    'the filtered result must announce the positions, not "0 entries"'
  ).toContainText(new RegExp(`\\b${count} wait list positions?\\b`));
  const chip = page.getByRole('radio', { name: /^Waitlist\s*\d+/ });
  const chipCount = Number(/\d+/.exec((await chip.textContent()) ?? '')?.[0]);
  expect(chipCount, 'the chip counts waitlisted orders plus positions').toBeGreaterThanOrEqual(
    count
  );
  noteChecked(`${count} waiting position(s); chip reads ${chipCount}`);
  annotateBlockedWrites(ledger);
});

// ---------------------------------------------------------------------------
// Secretary: the shows this account manages, for the two tests below.
// ---------------------------------------------------------------------------

async function manageableShowIds(page: Page, auth: RestAuth) {
  const rows = await requireRead<string | Record<string, string>>(
    page,
    auth,
    'rpc/manageable_show_ids',
    {}
  );
  // A SETOF uuid function answers with bare strings; tolerate the object form.
  return rows
    .map(row => (typeof row === 'string' ? row : Object.values(row)[0]))
    .filter((id): id is string => typeof id === 'string');
}

// ---------------------------------------------------------------------------
// MYK9-637 (F44): the ringside class list shows each class's real entry count.
// ---------------------------------------------------------------------------

interface ReplicatedEntryRow {
  class_id: string;
  entry_status: string | null;
  check_in_status: string | null;
  deleted_at: string | null;
}

// entryAccounting.ts: what the ringside counter's denominator counts.
const NOT_EXPECTED_TO_RUN = new Set(['withdrawn', 'scratched', 'absent', 'moved', 'not_accepted']);
const expectedToRun = (row: ReplicatedEntryRow) =>
  row.deleted_at === null &&
  !NOT_EXPECTED_TO_RUN.has((row.entry_status ?? '').trim().toLowerCase()) &&
  row.check_in_status !== 'pulled';

test('the ringside class list shows each class its real entry count, never "0 / 0" (MYK9-637)', async ({
  page,
}) => {
  const { ledger, auth: captured } = await guardAndCapture(page);
  await signInAsSecretary(page, '/');
  const auth = await captured.get();

  let target: { showId: string; trialId: string; counts: number[] } | undefined;
  for (const showId of (await manageableShowIds(page, auth)).slice(0, SHOWS_TO_PROBE)) {
    const entries = await requireRead<ReplicatedEntryRow>(
      page,
      auth,
      'view_authenticated_entry_results_replication?select=class_id,entry_status,' +
        `check_in_status,deleted_at&show_id=eq.${showId}`
    );
    const perClass = new Map<string, number>();
    for (const row of entries.filter(expectedToRun)) {
      perClass.set(row.class_id, (perClass.get(row.class_id) ?? 0) + 1);
    }
    if (perClass.size === 0) continue;
    // Section A and B classes merge into one summed card; leave them out.
    const classes = await requireRead<{ id: string; trial_id: string; section: string | null }>(
      page,
      auth,
      `classes?select=id,trial_id,section&deleted_at=is.null&id=${inList([...perClass.keys()])}`
    );
    const unmerged = classes.filter(c => !/^[ab]$/i.test((c.section ?? '').trim()));
    const first = unmerged[0];
    if (!first) continue;
    target = {
      showId,
      trialId: first.trial_id,
      counts: unmerged.filter(c => c.trial_id === first.trial_id).map(c => perClass.get(c.id) ?? 0),
    };
    break;
  }
  if (!target) dataAbsent('no show the secretary manages has an unmerged class with entries');

  await page.goto(`/at-show/${target.showId}`);
  const trial = page.getByTestId(`at-show-trial-${target.trialId}`);
  await expect(trial).toBeVisible({ timeout: 30000 });
  for (const count of unique(target.counts)) {
    await expect(
      trial.getByRole('button', { name: new RegExp(`\\b\\d+ of ${count} scored\\b`) }).first(),
      `a class in this trial has ${count} entries expected to run; its row must say so`
    ).toBeVisible({ timeout: 30000 });
  }
  noteChecked(`trial ${target.trialId} on show ${target.showId}: counts ${unique(target.counts)}`);
  annotateBlockedWrites(ledger);
});

// ---------------------------------------------------------------------------
// MYK9-448: a single-registry show's report catalog offers that registry's
// forms and no other registry's.
// ---------------------------------------------------------------------------

const REGISTRY_PREFIX = {
  AKC: 'AKC ',
  UKC: 'UKC Nosework ',
  ASCA: 'ASCA Scent Detection ',
} as const;
type Registry = keyof typeof REGISTRY_PREFIX;
const TRIAL_REPORT: Record<Registry, string> = {
  AKC: 'AKC Trial Secretary Report',
  UKC: 'UKC Nosework Trial Report',
  ASCA: 'ASCA Scent Detection Trial Report',
};
const isRegistry = (value: string | null): value is Registry =>
  value !== null && value in REGISTRY_PREFIX;

test("a single-registry show's report catalog holds only that registry's forms (MYK9-448)", async ({
  page,
}) => {
  const { ledger, auth: captured } = await guardAndCapture(page);
  await signInAsSecretary(page, '/');
  const auth = await captured.get();

  const showIds = (await manageableShowIds(page, auth)).slice(0, SHOWS_TO_PROBE * 4);
  if (showIds.length === 0) dataAbsent('the secretary manages no show');
  // Every trial, deleted or not: a trial the replica still holds with another
  // registry would widen the catalog for a reason this canary is not about.
  const trials = await requireRead<{ id: string; show_id: string; registry_id: string | null }>(
    page,
    auth,
    `trials?select=id,show_id,registry_id&show_id=${inList(showIds)}`
  );
  let target: { showId: string; trialId: string; registry: Registry } | undefined;
  for (const showId of showIds) {
    const own = trials.filter(t => t.show_id === showId);
    const registries = unique(own.map(t => t.registry_id));
    const [only] = registries;
    if (own[0] && registries.length === 1 && isRegistry(only ?? null)) {
      target = { showId, trialId: own[0].id, registry: only as Registry };
      break;
    }
  }
  if (!target) dataAbsent('no show the secretary manages has trials of exactly one registry');

  const foreign = Object.entries(REGISTRY_PREFIX)
    .filter(([registry]) => registry !== target.registry)
    .map(([, prefix]) => prefix);
  await page.goto(`/shows/${target.showId}/reports?trialId=${target.trialId}`);
  const picker = page.locator('#report-type-select');
  await expect(picker).toBeVisible({ timeout: 30000 });

  // Before the trials resolve the catalog is deliberately the full list
  // (getReportsForRegistries' fallback), so poll until it scopes, and fail if
  // it never does. An empty read is "not open yet", never "no foreign form":
  // the first version of this test passed on an empty list.
  const readCatalog = async () => {
    await picker.click();
    const options = page.getByRole('listbox').getByRole('option');
    await expect(options.first()).toBeVisible();
    const names = (await options.allTextContents()).map(n => n.trim());
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    return names;
  };
  let names: string[] = [];
  await expect
    .poll(
      async () => {
        names = await readCatalog();
        return names.filter(name => foreign.some(prefix => name.startsWith(prefix)));
      },
      { timeout: 30000, message: `a ${target.registry}-only show listed another registry's form` }
    )
    .toEqual([]);
  expect(names.length, 'the report catalog must list reports').toBeGreaterThan(0);
  expect(names, `the ${target.registry} trial report must be offered`).toContain(
    TRIAL_REPORT[target.registry]
  );
  noteChecked(`${target.registry}-only show ${target.showId}: ${names.length} reports offered`);
  annotateBlockedWrites(ledger);
});
