import type { ShortReplicaReport } from '@myk9/replication';
import { reportShortReplica } from '@/services/observability/shortReplicaAlert';
import { supabase } from '../supabaseClient';
import { fetchKeysetPages } from '@/services/replication/keysetPager';
import { PEOPLE_MAPPER_COLUMNS } from './peopleColumns';

/**
 * MYK9-2253: the people directory is one table read, and PostgREST returns at most
 * `max_rows` rows per response, so an unpaged read kept the first 1,000 people and
 * said nothing. This reads every live row in pages and compares the total with the
 * server's own count.
 *
 * Paged on `id` alone: `people.updated_at` is nullable and a null never matches a
 * cursor comparison, so a timestamp cursor would drop such a row or throw on it.
 */

export const JUDGE_QUALIFICATIONS_SELECT = `judge_qualifications(
  id, organization, qualification_level, disciplines, judge_number,
  date_obtained, expiration_date, is_active
)`;

/** The name the short-download alert files this read under (MYK9-2254). */
export const PEOPLE_DIRECTORY_TABLE = 'people_directory';

export type PeopleRow = Record<string, unknown> & { id: string };

const byName = (a: PeopleRow, b: PeopleRow): number =>
  String(a.last_name ?? '').localeCompare(String(b.last_name ?? '')) ||
  String(a.first_name ?? '').localeCompare(String(b.first_name ?? ''));

export interface AllPeopleRead {
  rows: PeopleRow[];
  /** Set when fewer rows arrived than the server counted; the rows are then partial. */
  short: ShortReplicaReport | null;
}

/** Reads every live person, sorted by last then first name, and reports a short read. */
async function countLivePeople(): Promise<number> {
  const { count, error } = await supabase
    .from('people')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null);
  if (error) throw new Error(`People count failed: ${error.message}`);
  return count ?? 0;
}

export async function readAllPeoplePaged(): Promise<AllPeopleRead> {
  const countBefore = await countLivePeople();

  const rows = (await fetchKeysetPages({
    cursor: 'id',
    base: () =>
      supabase
        .from('people')
        .select(`${PEOPLE_MAPPER_COLUMNS}, ${JUDGE_QUALIFICATIONS_SELECT}`)
        .is('deleted_at', null),
    errorPrefix: 'People directory read failed',
  })) as unknown as PeopleRow[];
  rows.sort(byName);

  // Counted again after the pages: a person deleted mid-read lowers the second count,
  // so only a read short of both counts is short.
  const serverCount =
    rows.length < countBefore ? Math.min(countBefore, await countLivePeople()) : countBefore;
  const short =
    rows.length < serverCount
      ? {
          tableName: PEOPLE_DIRECTORY_TABLE,
          scope: undefined,
          serverCount,
          deviceCount: rows.length,
        }
      : null;
  // One verdict per read: the reporter files a short read once and re-arms on a whole one.
  reportShortReplica({ tableName: PEOPLE_DIRECTORY_TABLE, scope: undefined, short });
  return { rows, short };
}
