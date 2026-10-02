/**
 * Setup > Classes tab's built-in views (list-toolkit rollout, MYK9-811):
 * All, Pending, In progress, Completed (today's `StatusFilter`) plus Mine — replacing the
 * separate `StatusFilter`/`MineToggle` pair. The oct-10 rehearsal found the
 * tab defaulting to "My Classes" for a secretary who also had entries in the
 * show, hiding 18 of 20 classes; the fix is structural, not cosmetic — "Mine"
 * is now one pressable view among five, and the tab's own default state is
 * always "All" (see `ClassesTab.tsx`), never auto-scoped to entries owned by
 * the signed-in user.
 */

import type { ListView } from '@/components/list-toolkit';
import { getClassDisplayStatus, type ClassDisplayStatus } from '@myk9/core';
import type { ClassInfo } from './ClassesTab';

export type ClassesTabStatus = 'all' | 'pending' | 'in_progress' | 'completed';

export interface ClassesTabFilterState {
  status: ClassesTabStatus;
  mine: boolean;
}

export const CLASSES_TAB_DEFAULT_FILTERS: ClassesTabFilterState = { status: 'all', mine: false };

interface ClassesTabViewDefinition {
  id: string;
  label: string;
  state: ClassesTabFilterState;
}

const CLASSES_TAB_VIEWS: readonly ClassesTabViewDefinition[] = [
  { id: 'all', label: 'All', state: { status: 'all', mine: false } },
  { id: 'pending', label: 'Pending', state: { status: 'pending', mine: false } },
  { id: 'in_progress', label: 'In progress', state: { status: 'in_progress', mine: false } },
  { id: 'completed', label: 'Completed', state: { status: 'completed', mine: false } },
  { id: 'mine', label: 'Mine', state: { status: 'all', mine: true } },
];

function toClassDisplayStatus(cls: ClassInfo): ClassDisplayStatus {
  const input: Parameters<typeof getClassDisplayStatus>[0] = {
    status: cls.status,
    entry_count: cls.entryCount ?? 0,
    scored_count: cls.scoredCount ?? 0,
  };
  if (cls.isScoringFinalized !== undefined) input.is_scoring_finalized = cls.isScoringFinalized;
  if (cls.hasActiveEntries !== undefined) input.has_active_entries = cls.hasActiveEntries;
  return getClassDisplayStatus(input);
}

/** The single source of truth for the tab's visible rows AND every view count. */
export function filterClassesForTab(
  classes: ClassInfo[],
  state: ClassesTabFilterState
): ClassInfo[] {
  const scoped = state.mine ? classes.filter(cls => cls.userHasEntry) : classes;
  if (state.status === 'all') return scoped;
  return scoped.filter(cls => {
    const displayStatus = toClassDisplayStatus(cls);
    if (state.status === 'completed') return displayStatus === 'completed';
    if (state.status === 'in_progress') return displayStatus === 'in-progress';
    return displayStatus !== 'completed';
  });
}

function sameState(a: ClassesTabFilterState, b: ClassesTabFilterState): boolean {
  return a.status === b.status && a.mine === b.mine;
}

export function activeClassesTabViewId(state: ClassesTabFilterState): string | null {
  return CLASSES_TAB_VIEWS.find(view => sameState(view.state, state))?.id ?? null;
}

export function classesTabViewFilters(id: string): ClassesTabFilterState {
  return (CLASSES_TAB_VIEWS.find(view => view.id === id) ?? CLASSES_TAB_VIEWS[0]).state;
}

export function buildClassesTabViews(classes: ClassInfo[]): ListView[] {
  return CLASSES_TAB_VIEWS.map(view => ({
    id: view.id,
    label: view.label,
    count: filterClassesForTab(classes, view.state).length,
  }));
}
