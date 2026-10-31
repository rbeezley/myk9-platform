import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addEntryFormNote,
  deleteEntryFormNote,
  listEntryFormNotes,
  updateEntryFormNote,
} from '@/services/database/entry-form-notes';
import { useIsOnline } from '@/hooks/useNetworkStatus';

const key = (enrollmentId: string) => ['entry-form-notes', enrollmentId] as const;

/** Online-only: the query is disabled offline so it never reads as an empty list. */
export function useEntryFormNotes(enrollmentId: string) {
  const online = useIsOnline();
  return useQuery({
    queryKey: key(enrollmentId),
    queryFn: () => listEntryFormNotes(enrollmentId),
    enabled: online && Boolean(enrollmentId),
  });
}

export function useEntryFormNoteMutations(enrollmentId: string, personId: string | undefined) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: key(enrollmentId) });

  // Note text is private: keep it out of the global mutation-error log (queryClient.ts).
  const meta = { sensitiveVariables: true };

  const add = useMutation({
    meta,
    mutationFn: async (body: string) => {
      if (!personId) throw new Error('Not signed in');
      await addEntryFormNote(enrollmentId, body, personId);
    },
    onSuccess: refresh,
  });
  const update = useMutation({
    meta,
    mutationFn: ({ id, body }: { id: string; body: string }) => updateEntryFormNote(id, body),
    onSuccess: refresh,
  });
  const remove = useMutation({
    meta,
    mutationFn: (id: string) => deleteEntryFormNote(id),
    onSuccess: refresh,
  });
  return { add, update, remove };
}
