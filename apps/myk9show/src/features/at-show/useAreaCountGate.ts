/**
 * Area count for a flexible-area class (MYK9-1625): prompt, don't block.
 *
 * Someone who can manage the class is asked to choose the area count when the list
 * opens; they can dismiss it, and the class menu reopens it. A dog tap asks again
 * instead of opening the scoresheet, because the scoresheet needs the count.
 * Everyone else sees no prompt and their tap goes on to the scoresheet.
 *
 * Which classes are flexible, and their counts, come from `areaCountChoices`.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import type { UserRole as ShowRole } from '@/types/auth-types';
import { useLiveClasses } from './useLiveClasses';
import { useJudgeAssignedToClass } from './useJudgeAssignedToClass';
import { areaCountRangeFor, needsAreaCount } from './areaCountChoices';

interface UseAreaCountGateOptions {
  classId: string | undefined;
  /** The class's registry id; no prompt until it is known. */
  registry: string | undefined;
  /** Wait for the list's first load before prompting. */
  ready: boolean;
  /** The caller's ringside permission to manage the class. */
  canManage: boolean;
  showRole: ShowRole | null | undefined;
  setAreaCountDialogOpen: (open: boolean) => void;
  setAreaCountRequirements: (
    range: { min: number; max: number; maxTotalSeconds: number } | null
  ) => void;
}

export function useAreaCountGate({
  classId,
  registry,
  ready,
  canManage,
  showRole,
  setAreaCountDialogOpen,
  setAreaCountRequirements,
}: UseAreaCountGateOptions) {
  const classes = useLiveClasses(classId ? [classId] : []);
  const cls = classes?.[0] ?? null;
  const range = cls ? areaCountRangeFor(registry, cls.element, cls.level) : null;
  const needsCount = cls ? needsAreaCount(registry, cls) : false;

  const { user } = useAuthContext();
  const assignment = useJudgeAssignedToClass({
    showRole,
    isAnonymous: user?.is_anonymous === true,
    classId,
  });
  const mayAsk = canManage && assignment.status !== 'unassigned';

  // The picker's choices, kept for the class menu even once a count is saved.
  const min = range?.min;
  const max = range?.max;
  useEffect(() => {
    if (mayAsk && min != null && max != null) {
      // maxTotalSeconds is part of the shared dialog contract; this picker does not use it.
      setAreaCountRequirements({ min, max, maxTotalSeconds: 0 });
    } else {
      // The page stays mounted across classes: a class with no choice must not
      // inherit the previous class's Search areas tile.
      setAreaCountRequirements(null);
    }
  }, [mayAsk, min, max, setAreaCountRequirements]);

  const promptedRef = useRef<string | null>(null);
  useEffect(() => {
    if (ready && needsCount && mayAsk && classId && promptedRef.current !== classId) {
      promptedRef.current = classId;
      setAreaCountDialogOpen(true);
    }
  }, [ready, needsCount, mayAsk, classId, setAreaCountDialogOpen]);

  /** True when a dog tap must not open the scoresheet yet. */
  const gateEntryClick = useCallback((): boolean => {
    if (!mayAsk) return false;
    // The class read (local, milliseconds) has not answered: hold the tap rather
    // than skip the check.
    if (classId && classes === null) return true;
    if (!needsCount) return false;
    setAreaCountDialogOpen(true);
    return true;
  }, [mayAsk, classId, classes, needsCount, setAreaCountDialogOpen]);

  // True while this user is the one to be asked, so other prompts can wait their turn.
  return { asking: needsCount && mayAsk, gateEntryClick };
}
