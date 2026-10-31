import { useMemo } from 'react';
import { groupSectionedClasses, getClassIds } from '@myk9/ringside';
import { getTrialTimezone } from '@/features/registries';
import type { AtShowClassGroup } from './atShowClassListAdapter';
import { formatAtShowTrialHeading } from './atShowTrialHeading';
import { orderRingClassesByDay } from './orderRingClassesByDay';
import {
  sortClassesForAtShowScan,
  sortClassesForYourRing,
  yourRingScanPriority,
} from './atShowClassListSort';

interface PickerClassesArgs {
  groups: AtShowClassGroup[];
  organization: string;
  scopeToAssignedClasses: boolean;
  assignedClassIds: ReadonlySet<string>;
  /** Device-local class favorites (MYK9-1506); the picker's only favorite. */
  favoriteClassIds: ReadonlySet<string>;
  nowMs: number;
}

/**
 * The picker's cards: per-trial A/B-grouped classes in scan order, plus the
 * pinned "Your ring" set. Favorites are applied BEFORE A/B grouping so a combined
 * card is a favorite when either section is, and so toggling both keeps it so.
 */
export function useAtShowPickerClasses({
  groups,
  organization,
  scopeToAssignedClasses,
  assignedClassIds,
  favoriteClassIds,
  nowMs,
}: PickerClassesArgs) {
  const favoredGroups = useMemo(
    () =>
      groups.map(group => ({
        ...group,
        classes: group.classes.map(cls => ({ ...cls, is_favorite: favoriteClassIds.has(cls.id) })),
      })),
    [groups, favoriteClassIds]
  );

  // Group A/B pairs into single combined entries per trial (AKC: Novice only;
  // UKC: every level).
  const groupedByTrial = useMemo(
    () =>
      favoredGroups
        .map(g => ({
          ...g,
          classes: scopeToAssignedClasses
            ? g.classes.filter(cls => assignedClassIds.has(cls.id))
            : g.classes,
        }))
        .map(g => ({
          trial: g.trial,
          classes: sortClassesForAtShowScan(groupSectionedClasses(g.classes, organization)),
        })),
    [assignedClassIds, favoredGroups, scopeToAssignedClasses, organization]
  );

  // Filter before A/B grouping so a judge assigned to only one section never
  // gets an unassigned partner pulled into the pinned section.
  const yourRingClasses = useMemo(
    () =>
      orderRingClassesByDay(
        sortClassesForYourRing(
          favoredGroups.flatMap(group => {
            const assignedClasses = group.classes.filter(cls => assignedClassIds.has(cls.id));
            const scanPriorities = new Map(
              assignedClasses.map(cls => [cls.id, yourRingScanPriority(cls)])
            );

            return groupSectionedClasses(assignedClasses, organization).map(entry => ({
              entry,
              scanPriority: Math.min(
                ...getClassIds(entry).map(
                  classId => scanPriorities.get(classId) ?? yourRingScanPriority(entry)
                )
              ),
              trialTimeZone: getTrialTimezone(group.trial),
              trialHeading: formatAtShowTrialHeading(group.trial),
              trialDate: group.trial.date ?? group.trial.trial_date ?? undefined,
            }));
          })
        ),
        nowMs
      ),
    [assignedClassIds, favoredGroups, organization, nowMs]
  );

  return { groupedByTrial, yourRingClasses };
}
