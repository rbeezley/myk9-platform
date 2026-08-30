import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { buildSecretaryCockpitModel } from './secretaryCockpitModel';
import { SecretaryCockpitSchedule } from './SecretaryCockpitSchedule';
import type { SecretaryCockpitSnapshot } from './secretaryCockpitTypes';

// No Trial exists at all, so the selected day can only resolve to null — the
// show genuinely has nothing scheduled, distinct from a Trial whose Classes
// just don't match the active filter.
const snapshotWithNoTrials: SecretaryCockpitSnapshot = {
  showId: 'show-1',
  timeZone: 'America/Chicago',
  now: new Date('2026-07-20T14:00:00.000Z'),
  trials: [],
  classes: [],
};

const snapshotWithUnmatchedFilter: SecretaryCockpitSnapshot = {
  ...snapshotWithNoTrials,
  trials: [{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }],
  classes: [
    {
      id: 'class-1',
      trialId: 'trial-1',
      name: 'Container Novice',
      classOrder: 0,
      lifecycle: 'not-started',
      entryCount: 8,
      scoredCount: 0,
      actions: [],
      paperwork: [],
  entryRows: [],
      attention: [],
    },
  ],
};

function renderSchedule(snapshot: SecretaryCockpitSnapshot, filter: 'all' | 'needs-attention') {
  const model = buildSecretaryCockpitModel(snapshot, {
    filter,
    selectedDay: undefined,
    focusedClassId: undefined,
  });
  return render(
    <SecretaryCockpitSchedule
      model={model}
      sourceClasses={snapshot.classes}
      sourceTrials={snapshot.trials}
      timeZone={snapshot.timeZone}
      filter={filter}
      canManageShow
      onFilterChange={vi.fn()}
      onFocusClass={vi.fn()}
      onCommand={vi.fn()}
    />
  );
}

describe('SecretaryCockpitSchedule empty states', () => {
  it('reports no scheduled Classes when the show has no Trials at all, filter set to all', () => {
    renderSchedule(snapshotWithNoTrials, 'all');

    expect(screen.getByText('No Classes are scheduled for this day yet.')).toBeInTheDocument();
  });

  it('still reports no scheduled Classes — not a filter mismatch — when a non-all filter is active and the show has no Trials at all', () => {
    renderSchedule(snapshotWithNoTrials, 'needs-attention');

    expect(screen.getByText('No Classes are scheduled for this day yet.')).toBeInTheDocument();
    expect(screen.queryByText('No Classes match this filter today.')).not.toBeInTheDocument();
  });

  it('reports a filter mismatch when Classes exist today but none match the active filter', () => {
    renderSchedule(snapshotWithUnmatchedFilter, 'needs-attention');

    expect(screen.getByText('No Classes match this filter today.')).toBeInTheDocument();
    expect(
      screen.queryByText('No Classes are scheduled for this day yet.')
    ).not.toBeInTheDocument();
  });
});
