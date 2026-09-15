/**
 * MYK9-535: per-class-row withdraw eligibility for the Pull affordance.
 *
 * Extracted from `EntryEditDialog` so that file stays under the 500-line
 * ceiling. Reads the replicated entry rows, so the dialog needs no new props and
 * the affordance cannot disagree with the pre-check in `withdrawOwnEntry` — both
 * go through `evaluateWithdrawEligibility`.
 *
 * FAILS CLOSED in both directions: while the lookup is in flight the row reports
 * "checking…", and a lookup that throws reports a refusal rather than silently
 * re-enabling Pull. A row whose eligibility is unknown must not offer a
 * withdrawal the server may reject.
 *
 * Returns an EMPTY map for a show manager: `entries_update` admits them, so the
 * exhibitor-only guards do not apply and every row stays enabled.
 */
import { useEffect, useState } from 'react';
import { getWithdrawEligibility } from '@/services/database/entries/withdrawOwnEntry';
import type { WithdrawEligibility } from '@/services/database/entries/withdrawEligibility';

export type WithdrawEligibilityMap = Record<string, WithdrawEligibility>;

const EMPTY: WithdrawEligibilityMap = {};

const CHECKING: WithdrawEligibility = {
  allowed: false,
  code: 'unavailable',
  reason: 'Checking whether this entry can be withdrawn…',
};

const LOOKUP_FAILED: WithdrawEligibility = {
  allowed: false,
  code: 'unavailable',
  reason: "We couldn't check this entry right now — try again in a moment.",
};

export function useWithdrawEligibility(
  open: boolean,
  asShowManager: boolean,
  classIds: string[]
): WithdrawEligibilityMap {
  // The map is stamped with the id set it was computed for. Returning it only
  // on a match means a stale map can never be applied to a different set of
  // class rows — and the "not applicable" cases are DERIVED, never a setState
  // in the effect body (which would trigger cascading renders).
  const [loaded, setLoaded] = useState<{ key: string; map: WithdrawEligibilityMap } | null>(null);
  // The caller rebuilds its class array on every render, so key the effect on
  // the ids it actually reads rather than the array identity.
  const classIdKey = classIds.join(',');

  useEffect(() => {
    if (!open || asShowManager || classIdKey === '') return undefined;

    let cancelled = false;
    void (async () => {
      const ids = classIdKey.split(',');
      const pairs = await Promise.all(
        ids.map(async classId => {
          try {
            return [classId, await getWithdrawEligibility(classId)] as const;
          } catch {
            return [classId, LOOKUP_FAILED] as const;
          }
        })
      );
      if (!cancelled) setLoaded({ key: classIdKey, map: Object.fromEntries(pairs) });
    })();

    return () => {
      cancelled = true;
    };
  }, [open, asShowManager, classIdKey]);

  if (!open || asShowManager) return EMPTY;
  if (loaded?.key === classIdKey) return loaded.map;
  // Still loading: refuse every row rather than offering Pull for an entry we
  // have not checked yet.
  return classIdKey === ''
    ? EMPTY
    : Object.fromEntries(classIdKey.split(',').map(id => [id, CHECKING]));
}
