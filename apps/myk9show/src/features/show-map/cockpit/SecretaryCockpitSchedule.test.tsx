import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { setRevisedExpectedStart } from '@/services/show-day/classTimingMutations';
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
    expect(screen.queryByText('No Classes match this filter.')).not.toBeInTheDocument();
  });

  it('reports a filter mismatch when Classes exist today but none match the active filter', () => {
    renderSchedule(snapshotWithUnmatchedFilter, 'needs-attention');

    expect(screen.getByText('No Classes match this filter.')).toBeInTheDocument();
    expect(
      screen.queryByText('No Classes are scheduled for this day yet.')
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

describe('SecretaryCockpitSchedule view tabs', () => {
  it('shows a live count on every view, computed from the Classes already on the page', async () => {
    const { user } = renderSchedule(snapshotWithMixedStates, 'all');

    const select = screen.getByRole('combobox', { name: 'Show: Schedule filters' });
    expect(select).toHaveTextContent('All (3)');
    await user.click(select);
    expect(await screen.findByRole('option', { name: 'In progress (1)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Needs attention (1)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Needs closeout (1)' })).toBeInTheDocument();
  });

  it('narrows the schedule by calling onFilterChange, matching the prop contract from before the ListViewTabs swap', async () => {
    const onFilterChange = vi.fn();
    const model = buildSecretaryCockpitModel(snapshotWithMixedStates, {
      filter: 'all',
      selectedDay: undefined,
      focusedClassId: undefined,
    });
    const { user } = render(
      <SecretaryCockpitSchedule
        model={model}
        sourceClasses={snapshotWithMixedStates.classes}
        sourceTrials={snapshotWithMixedStates.trials}
        timeZone={snapshotWithMixedStates.timeZone}
        filter="all"
        canManageShow
        onFilterChange={onFilterChange}
        onFocusClass={vi.fn()}
        onCommand={vi.fn()}
      />
    );

    await user.click(screen.getByRole('combobox', { name: 'Show: Schedule filters' }));
    await user.click(await screen.findByRole('option', { name: /^Needs attention/ }));

    expect(onFilterChange).toHaveBeenCalledWith('needs-attention');
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

  it('renders the schedule and its view-tab counts from the already-loaded replicated data, and per-row mutations still queue', async () => {
    expect(window.navigator.onLine).toBe(false);

    const model = buildSecretaryCockpitModel(snapshotWithMixedStates, {
      filter: 'all',
      selectedDay: undefined,
      focusedClassId: undefined,
    });
    const { user } = render(
      <SecretaryCockpitSchedule
        model={model}
        sourceClasses={snapshotWithMixedStates.classes}
        sourceTrials={snapshotWithMixedStates.trials}
        timeZone={snapshotWithMixedStates.timeZone}
        filter="all"
        canManageShow
        onFilterChange={vi.fn()}
        onFocusClass={vi.fn()}
        onCommand={vi.fn()}
      />
    );

    // The schedule and its Classes render from the props already on the page --
    // nothing here ever fetches, so going offline changes nothing about them.
    expect(screen.getByText('Container Novice')).toBeInTheDocument();
    expect(screen.getByText('Interior Advanced')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Show: Schedule filters' }));
    expect(await screen.findByRole('option', { name: 'In progress (1)' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    // The per-row expected-start control still queues its update through the
    // replicated mutation path while offline (design.md §2.4: unchanged by
    // this change, still the canonical `replicatedClassesTable` write).
    await user.click(screen.getByRole('button', { name: /^\d{1,2}:\d{2}$/ }));
    await user.click(screen.getByRole('button', { name: 'Use scheduled time' }));

    expect(setRevisedExpectedStart).toHaveBeenCalledWith('class-1', null);
  });
});
