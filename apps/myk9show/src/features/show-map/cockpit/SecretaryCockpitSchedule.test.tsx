import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { buildSecretaryCockpitModel } from './secretaryCockpitModel';
import { SecretaryCockpitSchedule } from './SecretaryCockpitSchedule';
import type { SecretaryCockpitSnapshot } from './secretaryCockpitTypes';

vi.mock('@/services/show-day/classTimingMutations', () => ({
  setRevisedExpectedStart: vi.fn(async () => undefined),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// No Trial exists at all, so the selected day can only resolve to null — the
// show genuinely has nothing scheduled, distinct from a Trial whose Classes
// just don't match the active filter.
const snapshotWithNoTrials: SecretaryCockpitSnapshot = {
  showId: 'show-1',
  timeZone: 'America/Chicago',
  registryId: 'AKC',
  now: new Date('2026-07-20T14:00:00.000Z'),
  printTrackingInUse: true,
  checklistInUse: true,
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

function renderSchedule(
  snapshot: SecretaryCockpitSnapshot,
  filter: 'all' | 'needs-attention',
  manager = false
) {
  const model = buildSecretaryCockpitModel(snapshot, {
    statuses: filter === 'all' ? [] : ['needs-attention'],
    selectedDays: undefined,
    focusedClassId: undefined,
  });
  return render(
    <SecretaryCockpitSchedule
      showId="show-1"
      model={model}
      sourceClasses={snapshot.classes}
      sourceTrials={snapshot.trials}
      filtered={filter !== 'all'}
      onFocusClass={vi.fn()}
      renderTrialActions={manager ? () => null : undefined}
    />
  );
}

describe('SecretaryCockpitSchedule empty states', () => {
  it('reports no scheduled Classes when the show has no Trials at all, filter set to all', () => {
    renderSchedule(snapshotWithNoTrials, 'all');

    expect(screen.getByText('No classes are scheduled for this day yet.')).toBeInTheDocument();
  });

  it('still reports no scheduled Classes — not a filter mismatch — when a non-all filter is active and the show has no Trials at all', () => {
    renderSchedule(snapshotWithNoTrials, 'needs-attention');

    expect(screen.getByText('No classes are scheduled for this day yet.')).toBeInTheDocument();
    expect(screen.queryByText('No classes match this filter.')).not.toBeInTheDocument();
  });

  it('offers Add classes to a manager on an empty schedule, into the show-level Add classes flow', () => {
    renderSchedule(snapshotWithNoTrials, 'all', true);

    expect(screen.getByRole('link', { name: 'Add classes' })).toHaveAttribute(
      'href',
      '/secretary/create-show/wizard?showId=show-1&mode=add-classes'
    );
  });

  it('offers no Add classes link to someone who cannot manage the show', () => {
    renderSchedule(snapshotWithNoTrials, 'all');

    expect(screen.queryByRole('link', { name: 'Add classes' })).not.toBeInTheDocument();
  });

  it('offers no Add classes link when the filter hides classes that exist', () => {
    renderSchedule(snapshotWithUnmatchedFilter, 'needs-attention', true);

    expect(screen.getByText('No classes match this filter.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add classes' })).not.toBeInTheDocument();
  });

  it('reports a filter mismatch when Classes exist today but none match the active filter', () => {
    renderSchedule(snapshotWithUnmatchedFilter, 'needs-attention');

    expect(screen.getByText('No classes match this filter.')).toBeInTheDocument();
    expect(
      screen.queryByText('No classes are scheduled for this day yet.')
    ).not.toBeInTheDocument();
  });
});

// One Trial, three Classes covering every CockpitFilter: class-2 is in progress,
// class-3 carries an attention item AND needs closeout, so the tab counts are
// exercised against overlap, not just disjoint buckets.
const snapshotWithMixedStates: SecretaryCockpitSnapshot = {
  showId: 'show-1',
  timeZone: 'America/Chicago',
  registryId: 'AKC',
  now: new Date('2026-07-20T14:00:00.000Z'),
  printTrackingInUse: true,
  checklistInUse: true,
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
      scheduledStart: '9:00 AM',
      revisedExpectedStart: '2026-07-20T15:00:00.000Z',
    },
    {
      id: 'class-2',
      trialId: 'trial-1',
      name: 'Interior Advanced',
      classOrder: 1,
      lifecycle: 'in-progress',
      entryCount: 5,
      scoredCount: 1,
      actions: [],
      paperwork: [],
      entryRows: [],
      attention: [],
    },
    {
      id: 'class-3',
      trialId: 'trial-1',
      name: 'Exterior Excellent',
      classOrder: 2,
      lifecycle: 'not-started',
      entryCount: 3,
      scoredCount: 0,
      actions: [],
      paperwork: [],
      entryRows: [],
      attention: [
        {
          id: 'att-1',
          classId: 'class-3',
          kind: 'blocker',
          label: 'Missing paperwork',
          reason: 'Check-in sheet not confirmed',
          destination: null,
        },
      ],
      closeout: 'needs-closeout',
    },
  ],
};

describe('SecretaryCockpitSchedule filtering', () => {
  it('has no View dropdown; the Filter button above the schedule holds the statuses (MYK9-1727)', () => {
    renderSchedule(snapshotWithMixedStates, 'all');

    expect(screen.queryByRole('combobox', { name: /Schedule filters/ })).not.toBeInTheDocument();
    expect(screen.getByText('Container Novice')).toBeInTheDocument();
  });

  it('says no Classes match when a status is ticked and none does', () => {
    renderSchedule(snapshotWithUnmatchedFilter, 'needs-attention');

    expect(screen.getByText('No classes match this filter.')).toBeInTheDocument();
  });
});

describe('SecretaryCockpitSchedule offline', () => {
  const originalOnLine = window.navigator.onLine;

  beforeEach(() => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
  });

  afterEach(() => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: originalOnLine,
    });
    vi.clearAllMocks();
  });

  it('renders the schedule from the already-loaded replicated data', () => {
    expect(window.navigator.onLine).toBe(false);

    const model = buildSecretaryCockpitModel(snapshotWithMixedStates, {
      statuses: [],
      selectedDays: undefined,
      focusedClassId: undefined,
    });
    render(
      <SecretaryCockpitSchedule
        showId="show-1"
        model={model}
        sourceClasses={snapshotWithMixedStates.classes}
        sourceTrials={snapshotWithMixedStates.trials}
        filtered={false}
        onFocusClass={vi.fn()}
      />
    );

    // The schedule and its Classes render from the props already on the page --
    // nothing here ever fetches, so going offline changes nothing about them.
    expect(screen.getByText('Container Novice')).toBeInTheDocument();
    expect(screen.getByText('Interior Advanced')).toBeInTheDocument();

    // Rows are read-only summaries; the expected-start editor (and its queued
    // offline write, ClassOperationalControls.test.tsx) is in the class panel.
    expect(screen.queryByRole('button', { name: 'Use scheduled time' })).not.toBeInTheDocument();
  });
});
