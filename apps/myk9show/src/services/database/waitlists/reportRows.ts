/**
 * Waitlist rows for the Waitlist Report (MYK9-717).
 *
 * Built on `getWaitlistByClass`, the SAME replication-first read the Entries ->
 * Waitlist tab uses, so the printed report and the screen can never disagree
 * about who is waiting or in what order. The handler is
 * `waitlist_entries.handler_id`, falling back to the dog's owner when the
 * exhibitor named no handler, resolved through the same offline-aware people
 * hydration the entry reads use.
 *
 * Scoped by the caller's class ids -- the Reports page's own verified class
 * set -- rather than by re-deriving the show's classes from the trials
 * replica, so a trials replica that happens to be cold on this device cannot
 * turn a real waitlist into "nobody is waiting".
 */
import type { ReportWaitlistRow } from '@/lib/reports/types';
import { supabase, createDatabaseError } from '../supabaseClient';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedWaitlistEntriesTable } from '@/services/replication/ReplicatedWaitlistEntriesTable';
import { filterQueuedWaitlistEntries } from '@/utils/waitlistCountSelectors';
import { loadHandlerPeople } from '../entries/handlerHydration';
import { getWaitlistByClass } from './reads';

/**
 * The server has dogs waiting in these classes that this device's replica
 * does not hold yet. The report must say so rather than print an empty
 * waitlist; the replica subscription re-reads it once the sync lands.
 */
export class WaitlistNotDownloadedError extends Error {
  constructor() {
    super('The waitlist has not been downloaded to this device yet.');
    this.name = 'WaitlistNotDownloadedError';
  }
}

function personName(person: { first_name?: string | null; last_name?: string | null } | undefined) {
  if (!person) return null;
  return [person.first_name, person.last_name].filter(Boolean).join(' ').trim() || null;
}

/**
 * How many dogs the SERVER has waiting in these classes, or null when it
 * cannot be asked (offline, or the request failed).
 */
async function countServerWaiting(classIds: readonly string[]): Promise<number | null> {
  let result: { count: number | null; error: unknown };
  try {
    result = await supabase
      .from('waitlist_entries')
      .select('id', { count: 'exact', head: true })
      .in('class_id', [...classIds])
      .or('status.is.null,status.eq.waiting');
  } catch {
    return null;
  }
  return result.error ? null : result.count;
}

/**
 * The local waitlist is checked against the server before it is printed. A
 * replica that never synced reads exactly like a show nobody is waiting for,
 * and one that is part-synced (a newer waiting dog in another class not yet
 * downloaded) reads like a shorter waitlist. When the counts disagree the
 * report is blocked until the next waitlist sync lands; the replica
 * subscription in useWaitlistReportQuery re-reads it then.
 *
 * When the server cannot be asked, an empty local answer is an error (as
 * MYK9-721's reads treat it, `errorOnOnlineVerificationFailure`), while local
 * rows are the best answer available offline and print, the same stance as
 * the report rows (a paused read over settled rows is printable).
 */
async function verifyAgainstServer(
  classIds: readonly string[],
  localWaitingCount: number
): Promise<void> {
  const serverCount = await countServerWaiting(classIds);
  if (serverCount === null) {
    if (localWaitingCount > 0) return;
    throw createDatabaseError(
      new Error('Could not confirm the waitlist is empty'),
      'waitlist_entries',
      'waitlist_report_online_verify'
    );
  }
  if (serverCount !== localWaitingCount) throw new WaitlistNotDownloadedError();
}

export async function getWaitlistReportRows(
  classIds: readonly string[]
): Promise<ReportWaitlistRow[]> {
  if (classIds.length === 0) return [];
  const allWaitlist = await replicatedWaitlistEntriesTable.getAllOrThrow();

  const inScope = new Set(classIds);
  const localWaiting = filterQueuedWaitlistEntries(allWaitlist).filter(row =>
    inScope.has(row.classId)
  );
  await verifyAgainstServer(classIds, localWaiting.length);
  if (localWaiting.length === 0) return [];

  // Only the classes someone is waiting in are read row by row.
  const waitingClassIds = [...new Set(localWaiting.map(row => row.classId))];

  const perClass = await Promise.all(waitingClassIds.map(id => getWaitlistByClass(id)));
  const failed = perClass.find(result => result.error);
  if (failed?.error) throw failed.error;
  const entries = perClass.flatMap(result => result.data);
  if (entries.length === 0) return [];

  const dogIds = [...new Set(entries.map(e => e.dog_id))];
  const dogs = await Promise.all(dogIds.map(id => replicatedDogsTable.getDogById(id)));
  const ownerByDog = new Map(dogIds.map((id, i) => [id, dogs[i]?.ownerId ?? null] as const));

  const personIdFor = (entry: (typeof entries)[number]) =>
    entry.handler_id ?? ownerByDog.get(entry.dog_id) ?? null;
  const people = await loadHandlerPeople(
    entries.map(personIdFor).filter((id): id is string => Boolean(id))
  );

  return entries.map(entry => {
    const personId = personIdFor(entry);
    return {
      id: entry.id,
      classId: entry.class_id,
      position: entry.position,
      callName: entry.dog?.call_name || entry.dog?.name || 'Unknown dog',
      handler: personId ? personName(people.get(personId)) : null,
    };
  });
}
