/**
 * The show's Note to exhibitors (MYK9-1999): `shows.confirmation_message`, printed in the full
 * confirmation every exhibitor is emailed. Read and saved directly, like the venue Wi-Fi: a
 * show-settings field edited online by the show's managers.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { cacheStrategies } from '@/lib/queryClient';
import { notifications } from '@/lib/notifications';
import { showQueryKeys } from './useShowsDatabase';

/** Long enough for parking, crating and a late start; short enough to read in an email. */
export const EXHIBITOR_NOTE_MAX_LENGTH = 1000;

export const EXHIBITOR_NOTE_SAVE_FAILED = "We couldn't save the note to exhibitors. Try again.";

const noteKey = (showId: string) => [...showQueryKeys.detail(showId), 'exhibitorNote'];

export function useShowExhibitorNote(showId: string | null) {
  return useQuery({
    queryKey: noteKey(showId ?? ''),
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase
        .from('shows')
        .select('confirmation_message')
        .eq('id', showId!)
        .single();
      if (error) throw error;
      return data.confirmation_message ?? '';
    },
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
}

export function useExhibitorNoteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ showId, note }: { showId: string; note: string }) => {
      const { error } = await supabase
        .from('shows')
        .update({
          confirmation_message: note.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', showId);
      if (error) throw error;
    },
    onSuccess: (_, { showId }) => {
      void queryClient.invalidateQueries({ queryKey: showQueryKeys.detail(showId) });
      notifications.success('Note to exhibitors saved');
    },
    onError: () => {
      notifications.error(EXHIBITOR_NOTE_SAVE_FAILED);
    },
  });
}
