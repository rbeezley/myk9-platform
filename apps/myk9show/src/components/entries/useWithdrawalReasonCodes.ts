/**
 * MYK9-632: the stored withdrawal reason for each class row on the open card.
 *
 * Extracted from `EntryEditDialog` so that file stays under the 500-line
 * ceiling, and shaped like `useWithdrawEligibility` beside it: ONE round trip
 * for the whole card, the answer stamped with the id set it was fetched for so
 * a stale map can never be applied to a different set of rows, and no setState
 * in the effect body for the derived cases.
 *
 * Fails SILENT, not closed — the opposite of the eligibility hook, and for the
 * opposite reason. Eligibility gates an ACTION, so an unknown verdict must
 * refuse; this only elaborates a badge that already reads "Withdrawn", so an
 * unknown reason simply renders nothing extra.
 */
import { useEffect, useState } from 'react';
import { getWithdrawalReasonCodesForEntries } from '@/services/database/entries/withdrawalReasonCodes';
import type { WithdrawalReasonCodeMap } from '@/services/database/entries/withdrawalReasonCodes';

const EMPTY: WithdrawalReasonCodeMap = {};

export function useWithdrawalReasonCodes(
  open: boolean,
  classIds: string[]
): WithdrawalReasonCodeMap {
  const [loaded, setLoaded] = useState<{ key: string; map: WithdrawalReasonCodeMap } | null>(null);
  // The caller rebuilds its class array on every render, so key the effect on
  // the ids it actually reads rather than the array identity.
  const classIdKey = classIds.join(',');

  useEffect(() => {
    if (!open || classIdKey === '') return undefined;

    let cancelled = false;
    void (async () => {
      let map: WithdrawalReasonCodeMap = EMPTY;
      try {
        map = await getWithdrawalReasonCodesForEntries(classIdKey.split(','));
      } catch {
        map = EMPTY;
      }
      if (!cancelled) setLoaded({ key: classIdKey, map });
    })();

    return () => {
      cancelled = true;
    };
  }, [open, classIdKey]);

  if (!open) return EMPTY;
  return loaded?.key === classIdKey ? loaded.map : EMPTY;
}
