import type { ReaderContext } from './loadVirtualUserContext';
import { enrichClassRows, type EnrichableClassRow } from './loadVirtualUserEnrichment';

/**
 * One table's share of the app's 60 s replication pass, as a virtual reader issues it.
 *
 * `ReplicationSyncProvider` runs an UNSCOPED pass: `App.tsx` passes no
 * `syncScopeId`, so no table below filters by trial, owner or show, and RLS alone
 * decides what a role receives. That makes an exhibitor's and a secretary's pass
 * the same set of requests. Three tables issue nothing on that pass and are
 * deliberately absent: `entries` and `paperwork_prints` return early without a
 * show scope (the entries view is read by the per-show at-show sync, not by the
 * poll), and `people` has a no-op `sync`.
 *
 * Each function mirrors one `Replicated*Table.sync` adapter: the count the engine
 * takes before a fetch (`getRemoteRowCount`), the delta, and the table's follow-up
 * reads. `loadVirtualUser.fidelity.test.ts` runs the real tables and asserts the
 * requests are identical.
 */

/** `REPLICATION_INCREMENTAL_BUFFER_MS` and `..._HIGH_CHURN` in packages/replication. */
export const INCREMENTAL_BUFFER_MS = 60_000;
export const INCREMENTAL_BUFFER_MS_HIGH_CHURN = 5_000;

/** PostgREST `max_rows`: one page of every keyset read. */
export const KEYSET_PAGE_SIZE = 1000;
const ID_SCAN_MAX_PAGES = 100;

const CLASS_JUDGE_EMBED =
  'judge_assignments!judge_assignments_class_id_fkey(id, person_id, status)';

const DOG_REGISTRATION_SELECT =
  'id, dog_id, organization, registration_number, registration_date, verified, created_at, updated_at, registered_name, breed, variety, status, application_number, submission_date, certificate, is_primary, version';

const JUDGE_ASSIGNMENT_SELECT = `id, person_id, show_id, trial_id, class_id, status,
               invited_at, confirmed_at, created_at, updated_at,
               day_capacity_override, version,
               classes (
               name, element, level, status, start_time, checked_in_count, scored_count,
               total_entries_count, trial_id,
               trials ( date, timezone, show_id )
             )`;

type TimestampedRow = { id?: string; updated_at?: string };

/**
 * A filter applied to a PostgREST builder. Builders are chained generics keyed by
 * the table's generated types, which a dynamic table name cannot satisfy.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Narrow = (query: any) => any;

const COUNT = { count: 'exact', head: true } as const;

/** `select('id', head)` against `table`; true when it returned a count. A failed count never fails a sync. */
async function takeCount(
  ctx: ReaderContext,
  table: string,
  narrow: Narrow = q => q
): Promise<boolean> {
  const out = await ctx.request(`${table} (count)`, () =>
    narrow(ctx.client.from(table).select('id', COUNT)).abortSignal(ctx.signal)
  );
  return out.ok && out.count !== null;
}

/**
 * A table the engine counts: HEAD only when the cadence says so, then the delta,
 * then the cadence is told how it went, and only if the delta succeeded.
 */
async function countedDelta<T>(
  ctx: ReaderContext,
  table: string,
  narrow: Narrow,
  readDeltaRows: () => Promise<T[] | null>
): Promise<T[] | null> {
  const gate = ctx.countGate(table);
  const counted = gate.count ? await takeCount(ctx, table, narrow) : false;
  const rows = await readDeltaRows();
  if (rows) gate.record(counted, rows.length);
  return rows;
}

/** A delta read with no pagination, filtered by `narrow`, advancing the watermark. */
async function readDelta<T extends TimestampedRow>(
  ctx: ReaderContext,
  table: string,
  select: string,
  bufferMs: number,
  narrow: Narrow = q => q
): Promise<T[] | null> {
  const out = await ctx.request<T>(table, () =>
    narrow(ctx.client.from(table).select(select))
      .gt('updated_at', ctx.sinceIso(table, bufferMs))
      .order('updated_at', { ascending: true })
      .abortSignal(ctx.signal)
  );
  if (!out.ok) return null;
  ctx.advance(table, out.rows);
  ctx.tally(out.rows.length);
  return out.rows;
}

/** Keyset-paged delta on (updated_at, id), as judge_assignments and dog_registrations read. */
async function readKeysetDelta<T extends TimestampedRow>(
  ctx: ReaderContext,
  table: string,
  select: string
): Promise<T[] | null> {
  const rows: T[] = [];
  let cursor: { updatedAt: string; id: string } | undefined;
  for (;;) {
    const page = await ctx.request<T>(table, () => {
      const query = ctx.client.from(table).select(select);
      return (
        cursor
          ? query.or(
              `updated_at.gt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.gt.${cursor.id})`
            )
          : query.gt('updated_at', ctx.sinceIso(table, INCREMENTAL_BUFFER_MS))
      )
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(0, KEYSET_PAGE_SIZE - 1)
        .abortSignal(ctx.signal);
    });
    if (!page.ok) return null;
    rows.push(...page.rows);
    const last = page.rows.at(-1);
    if (page.rows.length < KEYSET_PAGE_SIZE || !last?.updated_at || !last.id) break;
    cursor = { updatedAt: String(last.updated_at), id: String(last.id) };
  }
  ctx.advance(table, rows);
  ctx.tally(rows.length);
  return rows;
}

/**
 * Every visible id, keyset-paged on id, as the dogs and registrations id scans
 * read. True when the scan completed (a short page); a failed page or the page
 * cap leaves it incomplete, and the app then leaves its cadence debt owed.
 */
async function scanIds(
  ctx: ReaderContext,
  table: string,
  narrow: Narrow = q => q
): Promise<boolean> {
  let lastId: string | undefined;
  for (let page = 0; page < ID_SCAN_MAX_PAGES; page++) {
    const out = await ctx.request<{ id: string }>(`${table} (id scan)`, () => {
      let query = narrow(ctx.client.from(table).select('id'));
      if (lastId !== undefined) query = query.gt('id', lastId);
      return query.order('id', { ascending: true }).limit(KEYSET_PAGE_SIZE).abortSignal(ctx.signal);
    });
    if (!out.ok) return false;
    if (out.rows.length < KEYSET_PAGE_SIZE) return true;
    lastId = String(out.rows[out.rows.length - 1].id);
  }
  return false;
}

/** The id scan when the app's cadence says it is due (MYK9-1302), stamped only on completion. */
async function scanIdsWhenDue(ctx: ReaderContext, table: string, narrow?: Narrow): Promise<void> {
  const gate = ctx.idScanGate(table);
  if (!gate.scan) return;
  if (await scanIds(ctx, table, narrow)) gate.record();
}

const live: Narrow = query => query.is('deleted_at', null);

async function syncShows(ctx: ReaderContext): Promise<void> {
  await countedDelta(ctx, 'shows', live, () =>
    readDelta(ctx, 'shows', '*', INCREMENTAL_BUFFER_MS, live)
  );
}

async function syncTrials(ctx: ReaderContext): Promise<void> {
  await countedDelta(ctx, 'trials', live, () =>
    readDelta(ctx, 'trials', '*', INCREMENTAL_BUFFER_MS)
  );
}

async function syncClasses(ctx: ReaderContext): Promise<void> {
  const rows = await countedDelta(
    ctx,
    'classes',
    q => q,
    () =>
      readDelta<TimestampedRow & EnrichableClassRow>(
        ctx,
        'classes',
        `${ctx.classColumnSelect}, ${CLASS_JUDGE_EMBED}`,
        INCREMENTAL_BUFFER_MS_HIGH_CHURN
      )
  );
  if (rows && rows.length > 0) await enrichClassRows(ctx, rows);
}

async function syncDogs(ctx: ReaderContext): Promise<void> {
  // No engine count on dogs yet (MYK9-1321): the fetch is one request capped at
  // PostgREST's 1000 rows, so a count above that would read as partial every pass.
  const rows = await readDelta(ctx, 'dogs', '*', INCREMENTAL_BUFFER_MS);
  // Tombstones are invisible to the delta (RLS hides soft-deleted dogs), so the
  // app re-reads every live id after a good download, when the id-scan cadence
  // says so. Staff see every dog.
  if (rows) await scanIdsWhenDue(ctx, 'dogs', live);
}

async function syncDogRegistrations(ctx: ReaderContext): Promise<void> {
  const rows = await countedDelta(
    ctx,
    'dog_registrations',
    q => q,
    () => readKeysetDelta(ctx, 'dog_registrations', DOG_REGISTRATION_SELECT)
  );
  // The id pass also fetches ids this device lacks; a warm replica lacks none.
  if (rows) await scanIdsWhenDue(ctx, 'dog_registrations');
}

async function syncClubs(ctx: ReaderContext): Promise<void> {
  const rows = await readDelta(ctx, 'clubs', '*', INCREMENTAL_BUFFER_MS, live);
  if (!rows) return;
  // reconcileVisibility, when the id-scan cadence says it is due: a count to
  // prove the id set is not truncated, then the ids.
  const gate = ctx.idScanGate('clubs');
  if (!gate.scan) return;
  const out = await ctx.request('clubs (count)', () =>
    live(ctx.client.from('clubs').select('id', COUNT)).abortSignal(ctx.signal)
  );
  if (!out.ok || out.count === null || out.count > KEYSET_PAGE_SIZE) return;
  const ids = await ctx.request('clubs (id scan)', () =>
    live(ctx.client.from('clubs').select('id')).limit(KEYSET_PAGE_SIZE).abortSignal(ctx.signal)
  );
  if (ids.ok) gate.record();
}

async function syncJudgeAssignments(ctx: ReaderContext): Promise<void> {
  await countedDelta(
    ctx,
    'judge_assignments',
    q => q,
    () => readKeysetDelta(ctx, 'judge_assignments', JUDGE_ASSIGNMENT_SELECT)
  );
}

/** Armbands have no `updated_at`: every pass downloads every unavailable armband. */
async function syncArmbands(ctx: ReaderContext): Promise<void> {
  const out = await ctx.request<TimestampedRow>('armbands', () =>
    ctx.client
      .from('armbands')
      .select('*')
      .eq('is_available', false)
      .order('created_at', { ascending: true })
      .abortSignal(ctx.signal)
  );
  if (out.ok) ctx.tally(out.rows.length);
}

async function syncWaitlistEntries(ctx: ReaderContext): Promise<void> {
  await countedDelta(
    ctx,
    'waitlist_entries',
    q => q,
    () => readDelta(ctx, 'waitlist_entries', '*', INCREMENTAL_BUFFER_MS)
  );
}

/** The tables the poll reads, in the provider's order. The provider runs them concurrently. */
export const READER_TABLE_PASSES: readonly {
  readonly table: string;
  readonly run: (ctx: ReaderContext) => Promise<void>;
}[] = [
  { table: 'shows', run: syncShows },
  { table: 'trials', run: syncTrials },
  { table: 'classes', run: syncClasses },
  { table: 'dogs', run: syncDogs },
  { table: 'dog_registrations', run: syncDogRegistrations },
  { table: 'clubs', run: syncClubs },
  { table: 'judge_assignments', run: syncJudgeAssignments },
  { table: 'armbands', run: syncArmbands },
  { table: 'waitlist_entries', run: syncWaitlistEntries },
];

/** One full pass: every table at once, as `Promise.all` over the replicated tables does. */
export async function runReaderPass(ctx: ReaderContext): Promise<void> {
  await Promise.all(READER_TABLE_PASSES.map(({ run }) => run(ctx)));
}
