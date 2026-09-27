/**
 * Cockpit schedule's built-in views (list-toolkit rollout, MYK9-812) — the same
 * four pills `SecretaryCockpitSchedule` rendered as plain buttons, now
 * `ListViewTabs`. Counts are the Classes scheduled today under each filter,
 * derived from the same in-memory `model.attention.all` plus the
 * `sourceClasses`/`sourceTrials` this component already receives — no new
 * fetch, and no re-derivation of `buildAttention`'s own logic.
 */

import type { ListView } from '@/components/list-toolkit';
import type {
  CockpitFilter,
  SecretaryCockpitClass,
  SecretaryCockpitModel,
  SecretaryCockpitTrial,
} from './secretaryCockpitTypes';

const COCKPIT_VIEWS: readonly { id: CockpitFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'needs-attention', label: 'Needs attention' },
  { id: 'needs-closeout', label: 'Needs closeout' },
];

function matchesCockpitView(
  cls: SecretaryCockpitClass,
  view: CockpitFilter,
  attentionClassIds: ReadonlySet<string>
): boolean {
  switch (view) {
    case 'in-progress':
      return cls.lifecycle === 'in-progress';
    case 'needs-attention':
      return attentionClassIds.has(cls.id);
    case 'needs-closeout':
      return cls.closeout === 'needs-closeout';
    case 'all':
      return true;
  }
}

/** Every built-in view with its count of today's scheduled Classes. */
export function buildCockpitScheduleViews(
  model: SecretaryCockpitModel,
  sourceClasses: readonly SecretaryCockpitClass[],
  sourceTrials: readonly SecretaryCockpitTrial[]
): ListView[] {
  const trialIdsForSelectedDay = new Set(
    sourceTrials.filter(trial => trial.date === model.day.selected).map(trial => trial.id)
  );
  const dayClasses = sourceClasses.filter(cls => trialIdsForSelectedDay.has(cls.trialId));
  const attentionClassIds = new Set(
    model.attention.all.flatMap(item => (item.classId ? [item.classId] : []))
  );

  return COCKPIT_VIEWS.map(view => ({
    id: view.id,
    label: view.label,
    count: dayClasses.filter(cls => matchesCockpitView(cls, view.id, attentionClassIds)).length,
  }));
}
