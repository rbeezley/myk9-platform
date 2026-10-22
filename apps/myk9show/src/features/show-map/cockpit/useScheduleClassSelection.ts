import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { SELECT_CLASSES } from '@/pages/secretary/selectClassesRoutes';

import { leaveSelectClassesSearch } from './cockpitRoutes';
import {
  EMPTY_SCHEDULE_SELECTION,
  pruneSelection,
  toggleScheduleClass,
  toggleScheduleTrial,
  trialSelectionState,
  type ScheduleSelection,
} from './scheduleSelection';
import type { SecretaryCockpitModel } from './secretaryCockpitTypes';

export interface ScheduleClassSelection {
  /** `?select=classes`: rows tick instead of focusing, and the bulk bar is offered. */
  active: boolean;
  /** The ticks on rows the secretary can still see. */
  selection: ScheduleSelection;
  isSelected: (classId: string) => boolean;
  trialState: (trialId: string) => 'all' | 'some' | 'none';
  toggleClass: (classId: string, trialId: string) => void;
  toggleTrial: (trialId: string) => void;
  /** A collapsed trial hides its rows, so its ticks go with them. */
  onTrialOpenChange: (trialId: string, open: boolean) => void;
  clear: () => void;
  /** Leaves select mode, back to where the home sent it from. */
  done: () => void;
}

/**
 * Select classes on the show home's schedule (MYK9-1324). The selection lives only while the
 * mode is on and only for one day choice: a day chip, leaving the mode, or collapsing the trial
 * that holds it clears it, and a filter that hides a row drops that row's tick, so a bulk action
 * never reaches a class the secretary cannot see.
 */
export function useScheduleClassSelection(
  showId: string,
  model: SecretaryCockpitModel
): ScheduleClassSelection {
  const [searchParams, setSearchParams] = useSearchParams();
  const active = searchParams.get('select') === SELECT_CLASSES;
  const dayKey = model.day.allDays ? 'all' : (model.day.selected ?? '');
  const [held, setHeld] = useState({ dayKey, selection: EMPTY_SCHEDULE_SELECTION });

  // Reset during render, not in an effect, so no render ever acts on the stale ticks.
  const stale = held.dayKey !== dayKey || (!active && held.selection.classIds.length > 0);
  if (stale) setHeld({ dayKey, selection: EMPTY_SCHEDULE_SELECTION });

  const visibleByTrial = useMemo(
    () =>
      new Map(
        model.trialGroups.map(group => [group.trialId, group.classes.map(cls => cls.id)] as const)
      ),
    [model.trialGroups]
  );
  const visible = useMemo(() => new Set([...visibleByTrial.values()].flat()), [visibleByTrial]);
  const pruned = pruneSelection(held.selection, visible);
  // A tick a filter hid is dropped for good, not hidden until the filter changes back.
  if (!stale && pruned !== held.selection) setHeld({ dayKey, selection: pruned });
  const selection = active && !stale ? pruned : EMPTY_SCHEDULE_SELECTION;

  const update = useCallback(
    (next: (current: ScheduleSelection) => ScheduleSelection) =>
      setHeld(current => ({
        ...current,
        selection: next(pruneSelection(current.selection, visible)),
      })),
    [visible]
  );
  const clear = useCallback(() => update(() => EMPTY_SCHEDULE_SELECTION), [update]);

  return {
    active,
    selection,
    isSelected: classId => selection.classIds.includes(classId),
    trialState: trialId =>
      trialSelectionState(selection, trialId, visibleByTrial.get(trialId) ?? []),
    toggleClass: (classId, trialId) =>
      update(current => toggleScheduleClass(current, classId, trialId)),
    toggleTrial: trialId =>
      update(current => toggleScheduleTrial(current, trialId, visibleByTrial.get(trialId) ?? [])),
    onTrialOpenChange: (trialId, open) => {
      if (!open && selection.trialId === trialId) clear();
    },
    clear,
    done: () => {
      clear();
      setSearchParams(previous => leaveSelectClassesSearch(previous, showId), {
        replace: true,
        preventScrollReset: true,
      });
    },
  };
}
