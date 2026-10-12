/**
 * Max time before the first dog (MYK9-1099), modelled on myK9Q's entry list.
 *
 * When a judge-set class opens at ringside with no max time, Set Max Time opens
 * with "Max time required before scoring", and tapping a dog opens it again
 * instead of the scoresheet. A rulebook (fixed) time needs nothing here: class
 * creation copies it onto the class (buildCreateShowPayload,
 * classDataToReplicatedClass; every live fixed-rule class carried it on
 * 2026-10-11), so ringside never writes one.
 *
 * The block is at the list, when it opens (owner decision 2026-10-11: the dog is
 * already at the ring, so the scoresheet is too late). A judge or admin
 * (canManageClasses) is asked unless the assignment check has CONFIRMED a signed-in
 * judge is not assigned to the class -- while it is still checking, they are asked,
 * so the prompt never waits on it. Everyone else's tap goes on to the scoresheet,
 * which gates them itself. A completed or cancelled class, or one with no
 * judge-set rule on this device, is never gated.
 */
import { useCallback, useEffect, useRef } from 'react';
import { isRuleCurrent } from '@/services/replication/resolveClassTimeLimitRules';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import { useAuthContext } from '@/hooks/useAuthContext';
import type { UserRole as ShowRole } from '@/types/auth-types';
import { useLiveClasses } from './useLiveClasses';
import { useJudgeAssignedToClass } from './useJudgeAssignedToClass';

interface UseMaxTimeGateOptions {
  /** The class, or both classes of a combined A/B list (one judge). */
  classIds: string[];
  /** Wait for the list's first load before prompting. */
  ready: boolean;
  /** The caller's ringside permission to set the max time (judge or admin). */
  canSetMaxTime: boolean;
  /** Account RBAC role, for the assigned-judge check. */
  showRole: ShowRole | null | undefined;
  /** The entry list's dialog state (stable useState setters). */
  setMaxTimeDialogOpen: (open: boolean) => void;
  setMaxTimeRequiredWarning: (warning: boolean) => void;
}

/** A judge-set class with no max time, still to be judged. */
function needsJudgeSetTime(cls: ReplicatedClass): boolean {
  const status = cls.classStatus?.toLowerCase();
  if (cls.timeLimitSeconds || status === 'completed' || status === 'cancelled') return false;
  const rule = cls.timeLimitRule;
  return isRuleCurrent(rule, cls) && !rule.fixed && !!rule.min && !!rule.max;
}

export function useMaxTimeGate({
  classIds,
  ready,
  canSetMaxTime,
  showRole,
  setMaxTimeDialogOpen,
  setMaxTimeRequiredWarning,
}: UseMaxTimeGateOptions) {
  // Read from the start (not after the list loads) and on every replica change:
  // a save to either section, a synced rule or a completed status all change it.
  const classes = useLiveClasses(classIds);
  const needsMaxTime = (classes ?? []).some(needsJudgeSetTime);

  const { user } = useAuthContext();
  const assignment = useJudgeAssignedToClass({
    showRole,
    isAnonymous: user?.is_anonymous === true,
    classId: classIds[0],
  });
  const mayAsk = canSetMaxTime && assignment.status !== 'unassigned';

  // Set Max Time with the "required before scoring" banner.
  const openRequired = useCallback(() => {
    setMaxTimeRequiredWarning(true);
    setMaxTimeDialogOpen(true);
  }, [setMaxTimeDialogOpen, setMaxTimeRequiredWarning]);
  // The classes already asked about: a list reused for another class asks again.
  const promptedRef = useRef<string | null>(null);
  const idsKey = classIds.join(',');

  // The judge is asked once when the list opens; a dog tap asks again.
  useEffect(() => {
    if (ready && needsMaxTime && mayAsk && promptedRef.current !== idsKey) {
      promptedRef.current = idsKey;
      openRequired();
    }
  }, [ready, needsMaxTime, mayAsk, idsKey, openRequired]);

  // Asked while the assignment check was still running, then found unassigned:
  // withdraw the prompt, since the server would refuse that judge's save.
  const denied = assignment.status === 'unassigned';
  useEffect(() => {
    if (denied && promptedRef.current === idsKey) {
      setMaxTimeRequiredWarning(false);
      setMaxTimeDialogOpen(false);
    }
  }, [denied, idsKey, setMaxTimeDialogOpen, setMaxTimeRequiredWarning]);

  /** True when a dog tap must not open the scoresheet yet. */
  const gateEntryClick = useCallback((): boolean => {
    if (!mayAsk) return false;
    // The class read (local, milliseconds) has not answered: hold the tap rather
    // than skip the check.
    if (classes === null) return true;
    if (!needsMaxTime) return false;
    openRequired();
    return true;
  }, [mayAsk, classes, needsMaxTime, openRequired]);

  return { needsMaxTime, gateEntryClick };
}
