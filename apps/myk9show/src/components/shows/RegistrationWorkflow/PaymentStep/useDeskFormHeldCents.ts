import { useQuery } from '@tanstack/react-query';
import { fetchDeskFormDueCents, heldCentsFromDue } from '@/features/registration/deskFormDue';

interface UseDeskFormHeldCentsInput {
  /** Only the secretary's online desk path asks; everyone else keeps today's step. */
  enabled: boolean;
  showId: string | undefined;
  /** The exhibitor whose form the entry is added to (the selected dogs' owner). */
  handlerId: string | undefined;
}

/**
 * MYK9-2149: the money the exhibitor's form already holds beyond what it owes, or null.
 * Fails closed: while loading, offline, on an error, or when the form holds nothing, the
 * answer is null and the payment step is today's normal one.
 */
export function useDeskFormHeldCents({
  enabled,
  showId,
  handlerId,
}: UseDeskFormHeldCentsInput): number | null {
  const asks = enabled && !!showId && !!handlerId;
  const { data, isError } = useQuery({
    queryKey: ['desk-form-due-cents', showId, handlerId],
    queryFn: () => fetchDeskFormDueCents(showId!, handlerId!),
    enabled: asks,
    // The form's money can move at another desk; ask again each time the step opens.
    staleTime: 0,
    retry: false,
  });
  if (!asks || isError || data === undefined) return null;
  const held = heldCentsFromDue(data);
  return held > 0 ? held : null;
}
