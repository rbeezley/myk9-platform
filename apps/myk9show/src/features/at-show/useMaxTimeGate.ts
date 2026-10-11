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
import { useCallback, useEffect, useRef } from 'react';
import { replicatedClassesTable } from '@/services/replication';
import { isRuleCurrent } from '@/services/replication/resolveClassTimeLimitRules';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import { logger } from '@/utils/logger';
import { useLiveClasses } from './useLiveClasses';

interface UseMaxTimeGateOptions {
  /** The class, or both classes of a combined A/B list. */
  classIds: string[];
  /** Wait for the list's first load before deciding. */
  ready: boolean;
  /** The caller can set the max time (judge or admin). */
  canSetMaxTime: boolean;
  /** The entry list's dialog state (stable useState setters). */
  setMaxTimeDialogOpen: (open: boolean) => void;
  setMaxTimeRequiredWarning: (warning: boolean) => void;
}

type ClassMaxTime = { kind: 'ok' } | { kind: 'missing' } | { kind: 'fixed'; seconds: number };

/**
 * A class's max-time state. A class with no max-time rule (Obedience, FastCat,
 * Rally) or whose rule is not on this device yet is never gated.
 */
function classMaxTime(cls: ReplicatedClass): ClassMaxTime {
  const status = cls.classStatus?.toLowerCase();
  if (cls.timeLimitSeconds || status === 'completed' || status === 'cancelled')
    return { kind: 'ok' };
  const rule = cls.timeLimitRule;
  if (!isRuleCurrent(rule, cls)) return { kind: 'ok' }; // the scoresheet notice covers it
  if (rule.fixed) return { kind: 'fixed', seconds: rule.fixed };
  return rule.min && rule.max ? { kind: 'missing' } : { kind: 'ok' };
}

export function useMaxTimeGate({
  classIds,
  ready,
  canSetMaxTime,
  setMaxTimeDialogOpen,
  setMaxTimeRequiredWarning,
}: UseMaxTimeGateOptions) {
  // Re-read on every replica change: a save to either section of a combined
  // list, a synced rule or a completed status all change the answer.
  const classes = useLiveClasses(classIds, ready);
  const states = (classes ?? []).map(cls => ({ id: cls.id, state: classMaxTime(cls) }));
  const needsMaxTime = states.some(s => s.state.kind === 'missing');
  // Set Max Time with the "required before scoring" banner.
  const openRequired = useCallback(() => {
    setMaxTimeRequiredWarning(true);
    setMaxTimeDialogOpen(true);
  }, [setMaxTimeDialogOpen, setMaxTimeRequiredWarning]);
  const promptedRef = useRef(false);
  const appliedRef = useRef(new Set<string>());
  const fixedKey = states
    .filter(s => s.state.kind === 'fixed')
    .map(s => `${s.id}:${(s.state as { seconds: number }).seconds}`)
    .join(',');

  // A rulebook time is applied once per class, offline, without asking.
  useEffect(() => {
    if (!canSetMaxTime || !fixedKey) return;
    for (const item of fixedKey.split(',')) {
      if (appliedRef.current.has(item)) continue;
      appliedRef.current.add(item);
      const [id, seconds] = item.split(':');
      replicatedClassesTable
        .updateClass(id!, { timeLimitSeconds: Number(seconds) })
        .catch(error => logger.warn(`[useMaxTimeGate] ${String(error)}`, 'at-show'));
    }
  }, [fixedKey, canSetMaxTime]);

  // The judge is asked once when the list opens; a dog tap asks again.
  useEffect(() => {
    if (needsMaxTime && canSetMaxTime && !promptedRef.current) {
      promptedRef.current = true;
      openRequired();
    }
  }, [needsMaxTime, canSetMaxTime, openRequired]);

  /** True when a dog tap must open Set Max Time instead of the scoresheet. */
  const gateEntryClick = useCallback((): boolean => {
    if (!needsMaxTime || !canSetMaxTime) return false;
    openRequired();
    return true;
  }, [needsMaxTime, canSetMaxTime, openRequired]);

  return { needsMaxTime, gateEntryClick };
}
