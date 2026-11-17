import { useQuery } from '@tanstack/react-query';
import {
  deskAddOnCollect,
  fetchDeskAddOnQuote,
  type DeskAddOnCollect,
} from '@/features/registration/deskAddOnCollect';

interface UseDeskAddOnCollectInput {
  /** Only the secretary's online desk path asks; everyone else keeps today's step. */
  enabled: boolean;
  showId: string | undefined;
  /** The exhibitor whose form the entry is added to (the selected dogs' owner). */
  handlerId: string | undefined;
  /** One class id per entry line about to be created (waitlist lines are not). */
  classIds: readonly string[];
  /** The secretary charges the show's junior handler fee, as submission will send it. */
  juniorOverride: boolean;
}

/**
 * MYK9-2149: the server's answer to "how much should the desk collect for this add-on?",
 * priced by the server as the submission will be. Asked again whenever the classes or
 * the junior fee choice change. While it loads, offline, or on an error the answer is
 * `unchanged` with no quote: the step never says "covered" without the server saying so.
 */
export function useDeskAddOnCollect({
  enabled,
  showId,
  handlerId,
  classIds,
  juniorOverride,
}: UseDeskAddOnCollectInput): DeskAddOnCollect {
  const asks = enabled && !!showId && !!handlerId && classIds.length > 0;
  const { data } = useQuery({
    queryKey: [
      'desk-addon-amount-to-collect',
      showId,
      handlerId,
      [...classIds].sort(),
      juniorOverride,
    ],
    queryFn: () => fetchDeskAddOnQuote(showId!, handlerId!, classIds, juniorOverride),
    enabled: asks,
    // The form's money can move at another desk; ask again each time the step opens.
    staleTime: 0,
    retry: false,
  });
  return asks ? deskAddOnCollect(data) : { kind: 'unchanged' };
}
