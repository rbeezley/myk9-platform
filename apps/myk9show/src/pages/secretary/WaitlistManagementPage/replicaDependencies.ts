/**
 * Every replica table the Waitlist tab's readers (`getClassesWithWaitlistCounts`,
 * `getWaitlistByClass`, `getWaitlistOffersByClass`) read. The tab re-reads when ANY of them
 * changes, since a table that finishes syncing after the others (dogs for names, trials for
 * headings) would otherwise leave the cached queue stale with no Refresh to recover it.
 *
 * `replicaDependencies.test.ts` fails when `services/database/waitlists/reads.ts` starts reading a
 * table that is not listed here, so a new dependency cannot be forgotten.
 */
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedWaitlistEntriesTable } from '@/services/replication/ReplicatedWaitlistEntriesTable';

export const WAITLIST_READ_TABLES = [
  { module: 'ReplicatedClassesTable', table: replicatedClassesTable },
  { module: 'ReplicatedDogsTable', table: replicatedDogsTable },
  { module: 'ReplicatedEntriesTable', table: replicatedEntriesTable },
  { module: 'ReplicatedTrialsTable', table: replicatedTrialsTable },
  { module: 'ReplicatedWaitlistEntriesTable', table: replicatedWaitlistEntriesTable },
] as const;
