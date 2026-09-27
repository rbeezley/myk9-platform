/**
 * Cockpit schedule's built-in views (list-toolkit rollout, MYK9-812) — the same
 * four pills `SecretaryCockpitSchedule` rendered as plain buttons, now
 * `ListViewTabs`.
 *
 * Counts are `model.daySchedule.filter(matchesCockpitFilter).length` --
 * literally the same rows and the same predicate `buildTrialGroups` in
 * `secretaryCockpitModel.ts` uses to decide what the schedule renders for the
 * currently active filter. There is no independent reconstruction of "which
 * Classes match this view" from `sourceClasses`/`sourceTrials`/`attention.all`
 * to drift out of sync with the schedule's own rows (Codex P2, MYK9-812).
 */

import type { ListView } from '@/components/list-toolkit';
import { matchesCockpitFilter } from './secretaryCockpitAttention';
import type { CockpitFilter, SecretaryCockpitModel } from './secretaryCockpitTypes';

const COCKPIT_VIEWS: readonly { id: CockpitFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'needs-attention', label: 'Needs attention' },
  { id: 'needs-closeout', label: 'Needs closeout' },
];

/** Every built-in view with its count of today's scheduled Classes. */
export function buildCockpitScheduleViews(model: SecretaryCockpitModel): ListView[] {
  return COCKPIT_VIEWS.map(view => ({
    id: view.id,
    label: view.label,
    count: model.daySchedule.filter(row =>
      matchesCockpitFilter(
        { lifecycle: row.lifecycle.value, closeout: row.closeout },
        view.id,
        row.attentionCount
      )
    ).length,
  }));
}
