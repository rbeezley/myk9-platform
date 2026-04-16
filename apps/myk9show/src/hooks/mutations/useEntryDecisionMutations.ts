import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateEntryStatus } from '@/services/database/queries/secretaryEntryQueries';
import type { PendingEntry } from '@/hooks/queries/usePendingEntries';
import { PENDING_ENTRIES_KEY } from '@/hooks/queries/usePendingEntries';

type Decision = 'accepted' | 'waitlist' | 'rejected';

const DECISION_STATUS_MAP: Record<Decision, string> = {
  accepted: 'confirmed',
  // Waitlist entries come from submitted status; move to confirmed until waitlist system integration
  waitlist: 'confirmed',
  rejected: 'withdrawn',
};

export function useEntryDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, decision }: { entryId: string; decision: Decision }) =>
      updateEntryStatus(entryId, DECISION_STATUS_MAP[decision]),

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
