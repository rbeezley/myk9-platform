import { useMutation, useQueryClient } from '@tanstack/react-query';
import { acceptEntry, rejectEntry, waitlistEntry } from '@/services/database/entries';
import type { PendingEntry } from '@/hooks/queries/usePendingEntries';
import { PENDING_ENTRIES_KEY } from '@/hooks/queries/usePendingEntries';

type Decision = 'accepted' | 'waitlist' | 'rejected';

const ENTRY_DECISION_TRANSITIONS = {
  accepted: acceptEntry,
  waitlist: waitlistEntry,
  rejected: rejectEntry,
};

export function useEntryDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entryId, decision }: { entryId: string; decision: Decision }) => {
      const result = await ENTRY_DECISION_TRANSITIONS[decision](entryId);
      if (result.error) throw result.error;
      return result;
    },

    onMutate: async ({ entryId }) => {
      await qc.cancelQueries({ queryKey: [PENDING_ENTRIES_KEY] });
      const previous = qc.getQueriesData<PendingEntry[]>({ queryKey: [PENDING_ENTRIES_KEY] });
      qc.setQueriesData<PendingEntry[]>({ queryKey: [PENDING_ENTRIES_KEY] }, (old = []) =>
        old.filter(e => e.id !== entryId)
      );
      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        context.previous.forEach(([key, data]) => qc.setQueryData(key, data));
      }
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: [PENDING_ENTRIES_KEY] });
      qc.invalidateQueries({ queryKey: ['entries'] });
    },
  });
}
