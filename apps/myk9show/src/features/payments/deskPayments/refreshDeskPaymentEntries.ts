import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';

/**
 * MYK9-2479 (Codex round 4 on #4461): a recorded desk payment changes each of its form's
 * entries' `payment_status` on the server, and Entry Management reads that field from the
 * entries replica when it is warm (`secretaryReadReplication`). The form's entries this
 * device holds are read back by id through the replica's own server read-back, the one a
 * move-up, a wait list offer and a cleared flagged pull use. Best effort: a failed read is
 * logged there, and the next sync brings the rows in.
 */
export async function refreshDeskPaymentEntries(
  showId: string,
  enrollmentIds: readonly string[]
): Promise<void> {
  const forms = new Set(enrollmentIds);
  const entryIds = (await replicatedEntriesTable.getEntriesByShow(showId))
    .filter(entry => entry.registrationId != null && forms.has(entry.registrationId))
    .map(entry => entry.id);
  await replicatedEntriesTable.refreshServerChangedEntries(entryIds, {
    insert: 'if-show-loaded',
    reason: 'desk payment recorded',
  });
}
