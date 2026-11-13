import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { CockpitFilterMenu } from './CockpitFilterMenu';
import { buildSecretaryCockpitModel } from './secretaryCockpitModel';
import type { CockpitClassFilters, SecretaryCockpitSnapshot } from './secretaryCockpitTypes';

const baseClass = {
  classOrder: 0,
  lifecycle: 'not-started' as const,
  entryCount: 4,
  scoredCount: 0,
  actions: [],
  paperwork: [],
  entryRows: [],
  attention: [],
};

function snapshotWith(trials: SecretaryCockpitSnapshot['trials']): SecretaryCockpitSnapshot {
  return {
    showId: 'show-1',
    timeZone: 'America/Chicago',
    registryId: 'AKC',
    now: new Date('2026-07-20T14:00:00.000Z'),
    printTrackingInUse: true,
    checklistInUse: true,
    trials,
    classes: [
      { ...baseClass, id: 'c1', trialId: 't1', name: 'Container Novice' },
      {
        ...baseClass,
        id: 'c2',
        trialId: 't1',
        name: 'Interior Advanced',
        lifecycle: 'in-progress',
      },
    ],
  };
}

const oneDay = snapshotWith([{ id: 't1', date: '2026-07-20', number: '1', order: 0 }]);
const twoDays = snapshotWith([
  { id: 't1', date: '2026-07-20', number: '1', order: 0 },
  { id: 't2', date: '2026-07-21', number: '2', order: 1 },
]);

function renderMenu(snapshot: SecretaryCockpitSnapshot, filters: CockpitClassFilters = {}) {
  const onClearAll = vi.fn();
  const onFiltersChange = vi.fn();
  const model = buildSecretaryCockpitModel(snapshot, filters);
  const view = render(
    <CockpitFilterMenu
      snapshot={snapshot}
      model={model}
      filters={filters}
      onDaysChange={vi.fn()}
      onFiltersChange={onFiltersChange}
      onClearAll={onClearAll}
    />
  );
  return { ...view, onClearAll, onFiltersChange };
}

describe('CockpitFilterMenu', () => {
  // cmdk scrolls the highlighted row into view; jsdom has no layout, so no scrollIntoView.
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('shows the Filter button with Status only, each option with its count, on a single-day show', async () => {
    const { user } = renderMenu(oneDay);

    await user.click(screen.getByRole('button', { name: 'Filter' }));
    expect(await screen.findByRole('option', { name: /Not started/ })).toHaveTextContent('1');
    expect(screen.getByRole('option', { name: /Complete/ })).toHaveTextContent('0');
    expect(screen.getByRole('option', { name: /Cancelled/ })).toHaveTextContent('0');
    expect(screen.getByRole('option', { name: /In progress/ })).toHaveTextContent('1');
    expect(screen.getByRole('option', { name: /Needs attention/ })).toHaveTextContent('0');
    expect(screen.getByRole('option', { name: /Needs wrap-up/ })).toHaveTextContent('0');
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.queryByText('Day')).not.toBeInTheDocument();
  });

  it('holds Day and Status on a multi-day show', async () => {
    const { user } = renderMenu(twoDays);

    await user.click(screen.getByRole('button', { name: 'Filter' }));
    expect(await screen.findByRole('option', { name: /Jul 21/ })).toBeInTheDocument();
    expect(screen.getByText('Day')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('shows Judge, Element and Level with counts when the show offers two or more', async () => {
    const rich: SecretaryCockpitSnapshot = {
      ...oneDay,
      classes: [
        {
          ...baseClass,
          id: 'c1',
          trialId: 't1',
          name: 'Container Novice',
          element: 'Container',
          level: 'Novice',
          judgeId: 'j1',
          judgeName: 'Pat Lee',
        },
        {
          ...baseClass,
          id: 'c2',
          trialId: 't1',
          name: 'Interior Novice',
          element: 'Interior',
          level: 'Novice',
          judgeId: 'j2',
          judgeName: 'Sam Roe',
        },
      ],
    };
    const { user, onFiltersChange } = renderMenu(rich);

    await user.click(screen.getByRole('button', { name: 'Filter' }));
    for (const heading of ['Judge', 'Element']) {
      expect(await screen.findByText(heading)).toBeInTheDocument();
    }
    // Level has one value (Novice), so it is hidden.
    expect(screen.queryByText('Level')).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Pat Lee/ })).toHaveTextContent('1');
    await user.click(screen.getByRole('option', { name: /Sam Roe/ }));
    expect(onFiltersChange).toHaveBeenCalledWith({ judges: ['j2'] });
  });

  it('hides Judge, Element and Level when each offers fewer than two options', async () => {
    const { user } = renderMenu(oneDay);

    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await screen.findByText('Status');
    for (const heading of ['Judge', 'Element', 'Level']) {
      expect(screen.queryByText(heading)).not.toBeInTheDocument();
    }
  });

  it('reports a ticked status as a list', async () => {
    const { user, onFiltersChange } = renderMenu(oneDay, { statuses: ['in-progress'] });

    await user.click(screen.getByRole('button', { name: /Filter/ }));
    await user.click(await screen.findByRole('option', { name: /Needs attention/ }));
    expect(onFiltersChange).toHaveBeenCalledWith({ statuses: ['in-progress', 'needs-attention'] });
  });

  it('shows an applied chip for a ticked status and clears all through one callback', async () => {
    const { user, onClearAll } = renderMenu(oneDay, { statuses: ['in-progress'] });

    expect(screen.getByText('Status: In progress')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Clear all/i }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });
});
