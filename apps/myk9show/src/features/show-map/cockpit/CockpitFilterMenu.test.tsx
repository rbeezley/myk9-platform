import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { CockpitFilterMenu } from './CockpitFilterMenu';
import { buildSecretaryCockpitModel } from './secretaryCockpitModel';
import type { CockpitStatus, SecretaryCockpitSnapshot } from './secretaryCockpitTypes';

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

function renderMenu(snapshot: SecretaryCockpitSnapshot, statuses: readonly CockpitStatus[] = []) {
  const onClearAll = vi.fn();
  const onStatusesChange = vi.fn();
  const model = buildSecretaryCockpitModel(snapshot, { statuses });
  const view = render(
    <CockpitFilterMenu
      snapshot={snapshot}
      model={model}
      statuses={statuses}
      onDaysChange={vi.fn()}
      onStatusesChange={onStatusesChange}
      onClearAll={onClearAll}
    />
  );
  return { ...view, onClearAll, onStatusesChange };
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
    expect(await screen.findByRole('option', { name: /In progress/ })).toHaveTextContent('1');
    expect(screen.getByRole('option', { name: /Needs attention/ })).toHaveTextContent('0');
    expect(screen.getByRole('option', { name: /Needs closeout/ })).toHaveTextContent('0');
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

  it('reports a ticked status as a list', async () => {
    const { user, onStatusesChange } = renderMenu(oneDay, ['in-progress']);

    await user.click(screen.getByRole('button', { name: /Filter/ }));
    await user.click(await screen.findByRole('option', { name: /Needs attention/ }));
    expect(onStatusesChange).toHaveBeenCalledWith(['in-progress', 'needs-attention']);
  });

  it('shows an applied chip for a ticked status and clears all through one callback', async () => {
    const { user, onClearAll } = renderMenu(oneDay, ['in-progress']);

    expect(screen.getByText('Status: In progress')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Clear all/i }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  // MYK9-1727: the badge counts picks; this line says how much of the schedule is showing.
  it('says how many classes are showing once a status is ticked, and Show all clears it', async () => {
    const { user, onClearAll } = renderMenu(oneDay, ['in-progress']);

    expect(screen.getByText('Showing 1 of 2 classes.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show all classes' }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('stays quiet while nothing is ticked', () => {
    renderMenu(oneDay);
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show all classes' })).not.toBeInTheDocument();
  });
});
