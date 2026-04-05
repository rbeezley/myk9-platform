import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import type { WaitListEntry } from '@/types/waitlist-types';

interface WaitlistEntryRow {
  id: string;
  class_id: string;
  position: number;
  status: 'waiting' | 'offered' | 'accepted' | 'declined' | 'expired';
  offered_at: string | null;
  offer_expires_at: string | null;
  created_at: string;
  classes: {
    name: string;
    trials: {
      shows: { name: string } | null;
    } | null;
  } | null;
  dogs: { name: string | null; call_name: string | null } | null;
  exhibitor_profiles: {
    people: { first_name: string | null; last_name: string | null } | null;
  } | null;
}

const MY_WAITLIST_KEY = ['my-waitlist-entries'] as const;

export function useMyWaitlistEntries(exhibitorId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...MY_WAITLIST_KEY, exhibitorId],
    queryFn: async (): Promise<WaitListEntry[]> => {
      const { data, error } = await supabase
        .from('waitlist_entries')
        .select(
          `
          id,
          class_id,
          position,
          status,
          offered_at,
          offer_expires_at,
          created_at,
          classes (
            name,
            trials (
              shows ( name )
            )
          ),
          dogs ( name, call_name ),
          exhibitor_profiles (
            people!person_id ( first_name, last_name )
          )
        `
        )
        .eq('exhibitor_id', exhibitorId!)
        .in('status', ['waiting', 'offered'])
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data as unknown as WaitlistEntryRow[]).map(row => {
        const person = row.exhibitor_profiles?.people;
        const exhibitorName = person
          ? `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim()
          : 'Unknown';
        return {
          id: row.id,
          classId: row.class_id,
          className: row.classes?.name ?? 'Unknown Class',
          showName: row.classes?.trials?.shows?.name ?? 'Unknown Show',
          exhibitorId: exhibitorId!,
          exhibitorName,
          dogId: '', // not needed for exhibitor view
          dogName: row.dogs?.call_name ?? row.dogs?.name ?? 'Unknown Dog',
          handlerId: null,
          position: row.position,
          status: row.status,
          offeredAt: row.offered_at,
          offerExpiresAt: row.offer_expires_at,
          createdAt: row.created_at,
        };
      });
    },
    enabled: !!exhibitorId,
  });

  const withdraw = useMutation({
    mutationFn: async (waitlistEntryId: string) => {
      const { error } = await supabase.from('waitlist_entries').delete().eq('id', waitlistEntryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...MY_WAITLIST_KEY, exhibitorId] });
    },
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    withdraw,
  };
}
