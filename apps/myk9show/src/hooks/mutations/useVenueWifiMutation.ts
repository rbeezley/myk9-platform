/**
 * Venue WiFi Mutation Hook
 *
 * React Query mutation for updating venue_wifi_network and
 * venue_wifi_password on the shows table.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { notifications } from '@/lib/notifications';
import { showQueryKeys } from '../queries/useShowsDatabase';

interface VenueWifiUpdate {
  showId: string;
  network: string;
  password: string;
}

export function useVenueWifiMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ showId, network, password }: VenueWifiUpdate) => {
      const { error } = await supabase
        .from('shows')
        .update({
          venue_wifi_network: network || null,
          venue_wifi_password: password || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', showId);

      if (error) throw error;
    },
    onSuccess: (_, { showId }) => {
      queryClient.invalidateQueries({ queryKey: showQueryKeys.detail(showId) });
      queryClient.invalidateQueries({ queryKey: showQueryKeys.lists() });
      notifications.success('WiFi info saved');
    },
    onError: () => {
      notifications.error('Failed to save WiFi info');
    },
  });
}
