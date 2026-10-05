/**
 * The Wait List Settings card's on/off settings: each saves on its own, and
 * only its own column. A switch is a mode, not a form field, and must never
 * carry (or wait on) the capacity edits below it.
 *
 *   autoOffer       shows.waitlist_auto_offer (MYK9-1003)
 *   allowWaitlists  shows.allow_waitlist, "Allow wait lists" for the whole
 *                   show; a class with no setting of its own follows it
 *                   (MYK9-1019)
 *
 * The switch shows the new position while the save is in flight; a failed
 * save falls back to the stored value.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { TablesUpdate } from '@/types/supabase';
import type { WaitListShowConfig } from '@/types/waitlist-types';

export interface WaitListSettings {
  config: WaitListShowConfig;
  /** shows.waitlist_auto_offer; the database default (true) is today's behaviour. */
  autoOffer: boolean;
  /** shows.allow_waitlist; the database default (false) turns full entries away. */
  allowWaitlists: boolean;
}

export type WaitListSwitchName = 'autoOffer' | 'allowWaitlists';

export const waitListSettingsKey = (showId: string) => ['waitlist-settings', showId] as const;

function payloadFor(name: WaitListSwitchName, enabled: boolean): TablesUpdate<'shows'> {
  return name === 'autoOffer' ? { waitlist_auto_offer: enabled } : { allow_waitlist: enabled };
}

export interface WaitListSwitch {
  checked: boolean;
  isPending: boolean;
  isError: boolean;
  save: (enabled: boolean) => void;
}

export function useWaitListSwitch(
  showId: string,
  name: WaitListSwitchName,
  stored: boolean | undefined,
  fallback: boolean,
  onSaved?: () => void
): WaitListSwitch {
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
      queryClient.setQueryData<WaitListSettings>(waitListSettingsKey(showId), current =>
        current ? { ...current, [name]: enabled } : current
      );
      onSaved?.();
    },
    onSettled: () => setPending(null),
  });

  return {
    checked: pending ?? stored ?? fallback,
    isPending: mutation.isPending,
    isError: mutation.isError,
    save: mutation.mutate,
  };
}
