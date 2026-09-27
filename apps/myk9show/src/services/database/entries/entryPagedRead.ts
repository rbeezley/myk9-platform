/**
 * Whole-scope PostgREST reads of `entries` that name MYK9-639's
 * `moved_from_entry_id`: the show and trial Financial reads (summed as money)
 * and the class read. Two things every one of them needs, kept in one place:
 *
 * - PostgREST caps one response at `max_rows` (1000, supabase/config.toml), so
 *   a scope larger than that must be paged or it is silently understated
 *   (MYK9-761, MYK9-767).
 * - The link column may not exist yet during a deploy window, and PostgREST
 *   then fails the WHOLE request (42703), so each read retries without it.
 */
import { createDatabaseError } from '../supabaseClient';
import { compareNumberAscNullsLast } from '../_shared/read-shape';
import { logger } from '@/services/LoggingService';
import { isMoveUpLinkSchemaUnavailable } from '@/features/payments/pullRefundSchemaCompatibility';

/** PostgREST's `max_rows`: one response never holds more than this. */
export const ENTRY_READ_PAGE_SIZE = 1000;

/**
 * Run an entries read twice if it has to: once naming MYK9-639's
 * `moved_from_entry_id`, and again without it when the column does not exist.
 *
 * `supabase db push` is run by hand after the merge and Vercel serves `main`
 * before that happens, so for the length of that window PostgREST answers 42703
 * and fails the WHOLE request, not just the column. Only the reads paged
 * through `readAllEntryPages` name the link, so this is the only place the
 * window has to be handled; the other entry reads use the plain list.
 *
 * The degraded read simply carries no supersession link, which
 * `resolveMoneyRoot` already treats as "this row is its own root" — the
 * pre-MYK9-639 behaviour, not a new failure mode.
 */
async function withMoveUpLinkFallback<T>(
  run: (withLink: boolean) => PromiseLike<{ data: T | null; error: unknown }>
): Promise<{ data: T | null; error: unknown }> {
  const first = await run(true);
  if (!isMoveUpLinkSchemaUnavailable(first.error as { code?: string; message?: string } | null)) {
    return first;
  }
  logger.warn(
    '[entries] moved_from_entry_id is not in the schema yet; reading without the move-up link'
  );
  return run(false);
}

/**
 * The part of a filtered PostgREST builder the pager drives. The caller hands
 * over the query already selected and filtered; the pager owns ordering, the
 * keyset and the page window, so no read can get them subtly different.
 */
export interface KeysetPageQuery {
  order(column: 'id', options: { ascending: boolean }): KeysetPageQuery;
  lt(column: 'id', value: string): KeysetPageQuery;
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: unknown }>;
}

/**
 * Read every row of an entries scope, one `max_rows` page at a time.
 *
 * Pages by KEYSET on `id` alone (never null, unlike `created_at`): each page
 * asks for ids strictly below the previous page's last one, so an entry
 * registered mid-read can neither shift a boundary row onto the next page
 * (double-counted) nor off it (skipped), as OFFSET paging would. Rows come back
 * in id order; the caller restores whatever order it presents.
 *
 * A failed page throws, so the caller reports an error, never a partial total.
 * Once the link column is found missing, the remaining pages are read without
 * it rather than refused and retried one by one.
 */
export async function readAllEntryPages(
  buildQuery: (withLink: boolean) => KeysetPageQuery,
  operation: string
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let linkAvailable = true;
  let cursorId: string | null = null;

  const readPage = (withLink: boolean) => {
    let query = buildQuery(withLink).order('id', { ascending: false });
    if (cursorId) query = query.lt('id', cursorId);
    return query.range(0, ENTRY_READ_PAGE_SIZE - 1);
  };

  for (;;) {
    const { data, error } = linkAvailable
      ? await withMoveUpLinkFallback(withLink => {
          if (!withLink) linkAvailable = false;
          return readPage(withLink);
        })
      : await readPage(false);

    if (error) throw createDatabaseError(error, 'entries', operation);
    const page = (data || []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < ENTRY_READ_PAGE_SIZE) return rows;

    const lastRow = page[page.length - 1];
    if (!lastRow?.id) {
      throw createDatabaseError(
        new Error('Entries page is missing its stable pagination cursor'),
        'entries',
        operation
      );
    }
    cursorId = String(lastRow.id);
  }
}

/** Newest first, null timestamps last, id as the tie-break. */
export function compareNewestFirst(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const aAt = a.created_at ? String(a.created_at) : null;
  const bAt = b.created_at ? String(b.created_at) : null;
  if (aAt !== bAt) {
    if (aAt === null) return 1;
    if (bAt === null) return -1;
    return Date.parse(bAt) - Date.parse(aAt);
  }
  return String(b.id).localeCompare(String(a.id));
}

const compareRunOrderValue = compareNumberAscNullsLast<Record<string, unknown>>(row =>
  typeof row.run_order === 'number' ? row.run_order : null
);

/** Run order ascending, unordered rows last, id as the tie-break. */
export function compareRunOrder(a: Record<string, unknown>, b: Record<string, unknown>): number {
  return compareRunOrderValue(a, b) || String(a.id).localeCompare(String(b.id));
}
