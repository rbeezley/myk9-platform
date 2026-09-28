/**
 * Trials tab's built-in views (list-toolkit rollout, MYK9-798): All, Pending,
 * Completed — replacing the standalone `StatusFilter` segmented control with
 * the shared `ListViewTabs` used by Setup > Classes (`classesTabViews.ts`,
 * MYK9-811) and every other list-toolkit surface.
 */

import type { ListView } from '@/components/list-toolkit';
import { deriveTrialStatusKey } from '@myk9/core';
import type { Trial } from '@/components/trials/types/trial.types';
import type { TrialStats } from './TrialsTab';

export type TrialsTabStatus = 'all' | 'pending' | 'completed';

interface TrialsTabViewDefinition {
  id: TrialsTabStatus;
  label: string;
}

const TRIALS_TAB_VIEWS: readonly TrialsTabViewDefinition[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'completed', label: 'Completed' },
];

const EMPTY_STATS: TrialStats = {
  classCount: 0,
  entryCount: 0,
  completedClasses: 0,
  hasStarted: false,
};

function isTrialCompleted(trial: Trial, trialStats: Record<string, TrialStats>): boolean {
  const stats = trialStats[trial.id] || EMPTY_STATS;
  return (
    deriveTrialStatusKey({
      trialStatus: trial.status,
      classCount: stats.classCount,
      completedCount: stats.completedClasses,
      hasStarted: stats.hasStarted,
    }) === 'completed'
  );
}

/** The single source of truth for the tab's visible rows AND every view count. */
export function filterTrialsForTab(
  trials: Trial[],
  trialStats: Record<string, TrialStats>,
  status: TrialsTabStatus
): Trial[] {
  if (status === 'all') return trials;
  return trials.filter(trial => {
    const completed = isTrialCompleted(trial, trialStats);
    return status === 'completed' ? completed : !completed;
  });
}

export function activeTrialsTabViewId(status: TrialsTabStatus): string {
  return status;
}

export function trialsTabViewFilters(id: string): TrialsTabStatus {
  return TRIALS_TAB_VIEWS.find(view => view.id === id)?.id ?? 'all';
}

/**
 * Every built-in view with its count over the whole trial list. Hidden
 * entirely once every trial shares one status — mirrors the old
 * `StatusFilter`'s self-hiding rule, since a single-state tab has nothing to
 * switch between.
 */
export function buildTrialsTabViews(
  trials: Trial[],
  trialStats: Record<string, TrialStats>
): ListView[] {
  const completedCount = trials.filter(trial => isTrialCompleted(trial, trialStats)).length;
  if (completedCount === 0 || completedCount === trials.length) return [];
  return TRIALS_TAB_VIEWS.map(view => ({
    id: view.id,
    label: view.label,
    count: filterTrialsForTab(trials, trialStats, view.id).length,
  }));
}
