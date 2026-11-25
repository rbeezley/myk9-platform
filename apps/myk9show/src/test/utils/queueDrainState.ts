/**
 * Pure verdict on a device replication-queue snapshot (MYK9-2406). 'drained' only when BOTH
 * stores were read as arrays and both are empty; a missing store or a read-error string is
 * never treated as empty.
 */
export function queueDrainState(queue: Record<string, unknown>): string {
  const pending = queue.pending_mutations;
  const failed = queue.failed_mutations;
  if (!Array.isArray(pending)) return 'queue not readable';
  if (!Array.isArray(failed)) return 'failed store not readable';
  if (failed.length > 0) return `${failed.length} failed`;
  return pending.length === 0 ? 'drained' : `${pending.length} pending`;
}
