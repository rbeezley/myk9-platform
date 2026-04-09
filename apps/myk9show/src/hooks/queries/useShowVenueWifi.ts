/**
 * Query hook for fetching venue WiFi fields from the shows table.
 *
 * These fields were added by migration 127 and are not part of the
 * local Show interface, so we query them directly from Supabase.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { cacheStrategies } from '@/lib/queryClient';
import { showQueryKeys } from './useShowsDatabase';

export interface ShowVenueWifi {
  venueWifiNetwork: string | null;
  venueWifiPassword: string | null;
}

async function fetchShowVenueWifi(showId: string): Promise<ShowVenueWifi> {
  const { data, error } = await supabase
    .from('shows')
    .select('venue_wifi_network, venue_wifi_password')
    .eq('id', showId)
    .single();

  if (error) throw error;

  return {
    venueWifiNetwork: data.venue_wifi_network ?? null,
    venueWifiPassword: data.venue_wifi_password ?? null,
  };
}

export function useShowVenueWifi(showId: string | null) {
  return useQuery({
    queryKey: [...showQueryKeys.detail(showId!), 'venueWifi'],
    queryFn: () => fetchShowVenueWifi(showId!),
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
}
