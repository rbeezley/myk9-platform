/**
 * Max time before the first dog (MYK9-1099), modelled on myK9Q's entry list.
 *
 * When a class opens at ringside with no max time:
 *   - a rule with a FIXED time (UKC, ASCA Open, AKC fixed elements) is applied
 *     straight away, offline, from the rule cached on the class -- the judge never
 *     sees a dialog for a time the rulebook already decides;
 *   - otherwise a judge or admin gets Set Max Time with "Max time required before
 *     scoring", and tapping a dog opens it again instead of the scoresheet.
 *
 * Only people who can set the time are prompted, and only they write: a steward or
 * exhibitor opening the list changes nothing. A completed or cancelled class is
 * never gated.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { replicatedClassesTable } from '@/services/replication';
import { isRuleCurrent } from '@/services/replication/resolveClassTimeLimitRules';
import { logger } from '@/utils/logger';

interface UseMaxTimeGateOptions {
  /** The class, or both classes of a combined A/B list. */
  classIds: string[];
  /** Changes whenever a class's max time changes, so the gate re-reads. */
  timeLimitKey: string | undefined;
  /** Wait for the list's first load before deciding. */
  ready: boolean;
  /** The caller can set the max time (judge or admin). */
  canSetMaxTime: boolean;
  /** The entry list's dialog state (stable useState setters). */
  setMaxTimeDialogOpen: (open: boolean) => void;
  setMaxTimeRequiredWarning: (warning: boolean) => void;
}

/**
 * Applies fixed rule times; returns whether a judge-set class still has no time.
 * A class with no max-time rule (Obedience, FastCat, Rally) or whose rule is not on
 * this device yet is never gated.
 */
async function applyFixedTimes(classIds: string[], canWrite: boolean): Promise<boolean> {
  let missing = false;
  for (const id of classIds) {
    const cls = await replicatedClassesTable.get(id);
    const status = cls?.classStatus?.toLowerCase();
    if (!cls || cls.timeLimitSeconds || status === 'completed' || status === 'cancelled') continue;
    const rule = cls.timeLimitRule;
    if (!isRuleCurrent(rule, cls)) continue; // unknown rule: the scoresheet notice covers it
    if (rule.fixed) {
      if (canWrite) await replicatedClassesTable.updateClass(id, { timeLimitSeconds: rule.fixed });
      continue;
    }
    if (rule.min && rule.max) missing = true; // judge-set: the judge must choose
  }
  return missing;
}

export function useMaxTimeGate({
  classIds,
  timeLimitKey,
  ready,
  canSetMaxTime,
  setMaxTimeDialogOpen,
  setMaxTimeRequiredWarning,
}: UseMaxTimeGateOptions) {
  const [needsMaxTime, setNeedsMaxTime] = useState(false);
  // Set Max Time with the "required before scoring" banner.
  const openRequired = useCallback(() => {
    setMaxTimeRequiredWarning(true);
    setMaxTimeDialogOpen(true);
  }, [setMaxTimeDialogOpen, setMaxTimeRequiredWarning]);
  const promptedRef = useRef(false);
  const idsKey = classIds.join(',');

  useEffect(() => {
    if (!ready || !idsKey) return;
    let cancelled = false;
    applyFixedTimes(idsKey.split(','), canSetMaxTime)
      .then(missing => {
        if (cancelled) return;
        setNeedsMaxTime(missing);
        if (missing && canSetMaxTime && !promptedRef.current) {
          promptedRef.current = true;
          openRequired();
        }
      })
      .catch(error => logger.warn(`[useMaxTimeGate] ${String(error)}`, 'at-show'));
    return () => {
      cancelled = true;
    };
  }, [ready, idsKey, timeLimitKey, canSetMaxTime, openRequired]);

  /** True when a dog tap must open Set Max Time instead of the scoresheet. */
  const gateEntryClick = useCallback((): boolean => {
    if (!needsMaxTime || !canSetMaxTime) return false;
    openRequired();
    return true;
  }, [needsMaxTime, canSetMaxTime, openRequired]);

  return { needsMaxTime, gateEntryClick };
}
