import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateEntryStatus } from '@/services/database/entries';
import type { PendingEntry } from '@/hooks/queries/usePendingEntries';
import { PENDING_ENTRIES_KEY } from '@/hooks/queries/usePendingEntries';
import type { EntryStatus } from '@/types/entry-lifecycle';

type Decision = 'accepted' | 'waitlist' | 'rejected';

const DECISION_STATUS_MAP: Record<Decision, EntryStatus> = {
  accepted: 'confirmed',
  // TODO(waitlist-system): map to 'waitlisted' once waitlist system integration is complete
  waitlist: 'confirmed',
  rejected: 'withdrawn',
};

export function useEntryDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entryId, decision }: { entryId: string; decision: Decision }) => {
      const result = await updateEntryStatus(entryId, DECISION_STATUS_MAP[decision]);
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
