/**
 * The Class changes card's two on/off settings (MYK9-1929, MYK9-2425): each
 * saves on its own, and only its own column, in the style of useWaitListSwitch.
 *
 *   afterClose   shows.allow_class_changes_after_close
 *   sameDay      shows.allow_same_day_move_ups
 *
 * The switch shows the new position while the save is in flight; a failed save
 * falls back to the stored value. Both columns default to allowed.
 */
import { useState } from 'react';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { TablesUpdate } from '@/types/supabase';

export interface ClassChangeSettings {
  afterClose: boolean;
  sameDay: boolean;
}

export type ClassChangeSwitchName = keyof ClassChangeSettings;

export interface ClassChangeSwitch {
  checked: boolean;
  isPending: boolean;
  isError: boolean;
  save: (enabled: boolean) => void;
}

export const classChangeSettingsKey = (showId: string) =>
  ['class-change-settings', showId] as const;

export const classChangeSettingsQueryOptions = (showId: string) =>
  queryOptions({
    queryKey: classChangeSettingsKey(showId),
    queryFn: async (): Promise<ClassChangeSettings> => {
      const { data, error } = await supabase
        .from('shows')
        .select('allow_class_changes_after_close, allow_same_day_move_ups')
        .eq('id', showId)
        .single();
      if (error) throw error;
      return {
        afterClose: data.allow_class_changes_after_close,
        sameDay: data.allow_same_day_move_ups,
      };
    },
    enabled: !!showId,
  });

function payloadFor(name: ClassChangeSwitchName, enabled: boolean): TablesUpdate<'shows'> {
  return name === 'afterClose'
    ? { allow_class_changes_after_close: enabled }
    : { allow_same_day_move_ups: enabled };
}

export function useClassChangeSwitch(
  showId: string,
  name: ClassChangeSwitchName,
  stored: boolean | undefined
): ClassChangeSwitch {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<boolean | null>(null);
  const mutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('shows')
        .update(payloadFor(name, enabled))
        .eq('id', showId);
      if (error) throw error;
    },
    onMutate: enabled => setPending(enabled),
    // Write the saved value into the cache before dropping the pending one, so
    // the switch never flickers back to the old position while a refetch runs.
    onSuccess: (_result, enabled) => {
      queryClient.setQueryData<ClassChangeSettings>(classChangeSettingsKey(showId), current =>
        current ? { ...current, [name]: enabled } : current
      );
    },
    onSettled: () => setPending(null),
  });

  return {
    checked: pending ?? stored ?? true,
    isPending: mutation.isPending,
    isError: mutation.isError,
    save: mutation.mutate,
  };
}
