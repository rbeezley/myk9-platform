/**
 * The replica read behind "waiting for you" on the Waitlist: every class's counts, and the
 * waitlist rows of the classes that have anyone waiting, an open offer or an offer that ran out.
 * Replica only, so it runs offline; the judge-day figures the spot rule also needs are the
 * server's and are read separately (`useJudgeDayCapacity`).
 */
import {
  replicatedWaitlistEntriesTable,
  type ReplicatedWaitlistEntry,
} from '@/services/replication/ReplicatedWaitlistEntriesTable';
import { getClassesWithWaitlistCounts, type ClassWithWaitlistCount } from './reads';

export interface ShowWaitlistRead {
  classes: ClassWithWaitlistCount[];
  waitlist: ReplicatedWaitlistEntry[];
}

export async function readShowWaitlist(showId: string): Promise<ShowWaitlistRead> {
  const { data, error } = await getClassesWithWaitlistCounts(showId);
  if (error) throw error;
  const withWaiting = data.filter(
    cls => cls.waitlist_count > 0 || (cls.offered_count ?? 0) > 0 || (cls.run_out_count ?? 0) > 0
  );
  const rows = await Promise.all(
    withWaiting.map(cls => replicatedWaitlistEntriesTable.getByClass(cls.id))
  );
  return { classes: data, waitlist: rows.flat() };
}
