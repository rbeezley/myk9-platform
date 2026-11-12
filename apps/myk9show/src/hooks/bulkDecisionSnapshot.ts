import type { EntryStatus } from '@/types/show-registration-types';
import type { BulkStatusChangeOptions, EntryManagementEntry } from '@/types/entry-management-types';

type EntriesPatch = (current: EntryManagementEntry[]) => EntryManagementEntry[];

/**
 * The entries of a bulk status change as they were decided (MYK9-1833, for the bulk path):
 * each captured with the change's patches applied (the armband an Accept assigns), so a
 * decision email can still be written after a show switch inside the Undo window has
 * dropped them from the page's list.
 */
export function createBulkDecisionSnapshot(status: EntryStatus) {
  const decided = new Map<string, EntryManagementEntry>();
  return {
    /** The `patchEntries` for one entry's change: forwards to the list and keeps the snapshot. */
    patchFor:
      (entry: EntryManagementEntry, setEntries: (update: EntriesPatch) => void) =>
      (update: EntriesPatch) => {
        setEntries(update);
        const base = decided.get(entry.id) ?? { ...entry, entryStatus: status };
        decided.set(entry.id, { ...(update([base])[0] ?? base), entryStatus: status });
      },
    /**
     * The succeeded entries whose decision stood: the live row when it is still on the list
     * (skipped if its status moved on since), the snapshot when it is not (a show switch).
     */
    stood(
      succeeded: EntryManagementEntry[],
      live: readonly EntryManagementEntry[]
    ): EntryManagementEntry[] {
      return succeeded.flatMap(entry => {
        const current = live.find(candidate => candidate.id === entry.id);
        if (current) return current.entryStatus === status ? [current] : [];
        const snapshot = decided.get(entry.id);
        return snapshot ? [snapshot] : [];
      });
    },
    /** The `onStood` run option for the bulk dispatcher, or nothing when the caller wants none. */
    stoodRunOption(
      options: BulkStatusChangeOptions | undefined,
      getLive: () => readonly EntryManagementEntry[]
    ) {
      const handOver = options?.onStood;
      if (!handOver) return {};
      return {
        onStood: (outcome: { succeeded: EntryManagementEntry[] }) => {
          const stood = this.stood(outcome.succeeded, getLive());
          if (stood.length > 0) handOver(stood);
        },
      };
    },
  };
}
