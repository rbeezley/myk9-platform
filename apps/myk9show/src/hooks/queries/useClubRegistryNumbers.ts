import { useQuery } from '@tanstack/react-query';
import { getClubRegistryNumbers } from '@/services/database/clubs';
import { queryKeys } from '@/lib/queryClient';

/**
 * A club's AKC / UKC / ASCA numbers (MYK9-1235). Readable by guests: the table
 * is visible wherever the club row is, and the numbers are public IDs.
 */
export function useClubRegistryNumbers(clubId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.clubRegistryNumbers(clubId),
    queryFn: () => getClubRegistryNumbers(clubId as string),
    enabled: Boolean(clubId),
    staleTime: 60_000,
  });
}
