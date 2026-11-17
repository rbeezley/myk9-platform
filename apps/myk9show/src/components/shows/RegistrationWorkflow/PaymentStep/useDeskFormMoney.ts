import { useQuery } from '@tanstack/react-query';
import {
  fetchDeskFormDueCents,
  heldCentsFromDue,
  type DeskFormMoney,
} from '@/features/registration/deskFormDue';

interface UseDeskFormMoneyInput {
  /** Only the secretary's online desk path asks, and only while the Payment step is open. */
  enabled: boolean;
  showId: string | undefined;
  /** The exhibitor whose form the entry is added to (the selected dogs' owner). */
  handlerId: string | undefined;
}

/**
 * MYK9-2149: whether the exhibitor's form already holds money, read fresh each time the
 * Payment step opens (the form's money can move at another desk). Only a CONFIRMED read of
 * money held changes the step; while checking, or when the read fails, the desk works as it
 * always has and anything taken is recorded in full.
 */
export function useDeskFormMoney({
  enabled,
  showId,
  handlerId,
}: UseDeskFormMoneyInput): DeskFormMoney {
  const asks = enabled && !!showId && !!handlerId;
  const { data, isError, isFetching } = useQuery({
    queryKey: ['desk-form-due-cents', showId, handlerId],
    queryFn: () => fetchDeskFormDueCents(showId!, handlerId!),
    enabled: asks,
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false,
  });
  if (!asks) return { status: 'unknown' };
  if (isFetching) return { status: 'checking' };
  if (isError || data === undefined) return { status: 'failed' };
  const heldCents = heldCentsFromDue(data);
  return heldCents > 0 ? { status: 'holds', heldCents } : { status: 'none' };
}
