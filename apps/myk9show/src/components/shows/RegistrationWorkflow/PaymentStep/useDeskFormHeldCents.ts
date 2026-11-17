import { useQuery } from '@tanstack/react-query';
import { fetchDeskFormDueCents, heldCentsFromDue } from '@/features/registration/deskFormDue';

interface UseDeskFormHeldCentsInput {
  /** Only the secretary's online desk path asks, and only while the Payment step is open. */
  enabled: boolean;
  showId: string | undefined;
  /** The exhibitor whose form the entry is added to (the selected dogs' owner). */
  handlerId: string | undefined;
}

/**
 * MYK9-2149 (inform only): the money the exhibitor's form already holds, or null. Read fresh
 * each time the Payment step opens (the form's money can move at another desk), and only a
 * read CONFIRMED in this visit counts: while loading, refetching, paused (offline), failed,
 * or answered only from cache, the answer is null and nothing is said.
 */
export function useDeskFormHeldCents({
  enabled,
  showId,
  handlerId,
}: UseDeskFormHeldCentsInput): number | null {
  const asks = enabled && !!showId && !!handlerId;
  const { data, isError, isFetching, fetchStatus, isFetchedAfterMount } = useQuery({
    queryKey: ['desk-form-due-cents', showId, handlerId],
    queryFn: () => fetchDeskFormDueCents(showId!, handlerId!),
    enabled: asks,
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false,
  });
  const confirmed =
    asks &&
    !isError &&
    !isFetching &&
    fetchStatus === 'idle' &&
    isFetchedAfterMount &&
    data !== undefined;
  if (!confirmed) return null;
  const held = heldCentsFromDue(data);
  return held > 0 ? held : null;
}
