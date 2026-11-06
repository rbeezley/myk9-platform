import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocation } from 'react-router-dom';

import { render } from '@/test/utils/testUtils';
import { SecretaryCockpit } from '../SecretaryCockpit';
import type { SecretaryCockpitClass, SecretaryCockpitSnapshot } from '../secretaryCockpitTypes';

vi.mock('@/hooks/useElementWidth', () => ({
  useElementWidth: () => ({ ref: { current: null }, width: null }),
}));

const showQuery = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/queries/useShowsDatabase', () => ({ useShowQuery: showQuery }));
const judgesQuery = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: judgesQuery,
}));

const classOf = (id: string, trialId: string, name: string): SecretaryCockpitClass => ({
  id,
  trialId,
  name,
  classOrder: 0,
  lifecycle: 'not-started',
  status: 'not_started',
  entryCount: 10,
  scoredCount: 0,
  judgeName: null,
  judgeId: null,
  entryRows: [],
  attention: [],
  actions: [],
  paperwork: [],
});

const multiDay: SecretaryCockpitSnapshot = {
  showId: 'show-1',
  timeZone: 'America/Chicago',
  registryId: 'AKC',
  now: new Date('2026-07-20T14:00:00.000Z'),
  printTrackingInUse: true,
  checklistInUse: true,
  trials: [
    { id: 'trial-1', date: '2026-07-20', number: '1', order: 0 },
    { id: 'trial-2', date: '2026-07-21', number: '2', order: 1 },
    { id: 'trial-3', date: '2026-07-22', number: '3', order: 2 },
  ],
  classes: [
    classOf('c1', 'trial-1', 'July 20'),
    classOf('c1b', 'trial-1', 'Interior Monday'),
    classOf('c2', 'trial-2', 'July 21'),
    classOf('c3', 'trial-3', 'July 22'),
  ],
};

function Probe() {
  return <p data-testid="search">{useLocation().search}</p>;
}

const renderDesk = (snapshot = multiDay, route = '/shows/show-1') =>
  render(
    <>
      <SecretaryCockpit snapshot={snapshot} canManageShow={false} onCommand={vi.fn()} />
      <Probe />
    </>,
    { initialRoute: route }
  );

const schedule = () => screen.getByRole('region', { name: 'Trial schedule' });
const search = () => decodeURIComponent(screen.getByTestId('search').textContent ?? '');

describe('Show Desk day filter (MYK9-1719)', () => {
  // cmdk scrolls the highlighted row into view; jsdom has no layout, so no scrollIntoView.
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    showQuery.mockReturnValue({ data: { id: 'show-1', organization: 'AKC' } });
    judgesQuery.mockReturnValue({ data: [] });
  });

  it('replaces the day buttons with one Filter button on a multi-day show', () => {
    renderDesk();

    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All days' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Show day')).not.toBeInTheDocument();
  });

  it('keeps the Filter button on a single-day show, with Status but no Day (MYK9-1727)', async () => {
    const { user } = renderDesk({
      ...multiDay,
      trials: multiDay.trials.slice(0, 1),
      classes: multiDay.classes,
    });

    await user.click(screen.getByRole('button', { name: 'Filter' }));
    expect(await screen.findByRole('option', { name: /Needs attention/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Jul 20/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Day')).not.toBeInTheDocument();
  });

  it('lists each day as an option with its class count', async () => {
    const { user } = renderDesk();
    await user.click(screen.getByRole('button', { name: 'Filter' }));

    const monday = await screen.findByRole('option', { name: /Jul 20/ });
    expect(monday).toHaveTextContent('2');
    expect(screen.getByRole('option', { name: /Jul 21/ })).toHaveTextContent('1');
    expect(screen.getByRole('option', { name: /Jul 22/ })).toHaveTextContent('1');
  });

  it('ticking several days shows those days and writes them to the URL; clearing means all', async () => {
    const { user } = renderDesk();
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(await screen.findByRole('option', { name: /Jul 21/ }));
    await user.click(screen.getByRole('option', { name: /Jul 22/ }));

    expect(search()).toContain('day=2026-07-21,2026-07-22');
    expect(schedule()).toHaveTextContent('July 21');
    expect(schedule()).toHaveTextContent('July 22');
    expect(schedule()).not.toHaveTextContent('July 20');
    // Days carry no inner comma, so the applied line reads as two days, not four parts.
    expect(screen.getByText('Day: Tue Jul 21, Wed Jul 22')).toBeInTheDocument();
    expect(screen.queryByText("Today's schedule")).not.toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: /Jul 21/ }));
    await user.click(screen.getByRole('option', { name: /Jul 22/ }));
    expect(search()).not.toContain('day=');
    expect(schedule()).toHaveTextContent('July 20');
  });

  it('opens on all days by default, and "Today\'s schedule" appears only when just today is ticked', async () => {
    const { user } = renderDesk();

    expect(search()).not.toContain('day=');
    expect(schedule()).toHaveTextContent('July 22');
    expect(screen.queryByText("Today's schedule")).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(await screen.findByRole('option', { name: /Jul 20/ }));
    expect(screen.getByText("Today's schedule")).toBeInTheDocument();
  });

  it('reads a stored single day from the URL as one ticked day', () => {
    renderDesk(multiDay, '/shows/show-1?day=2026-07-21');

    expect(schedule()).toHaveTextContent('July 21');
    expect(schedule()).not.toHaveTextContent('July 20');
    expect(screen.getByText(/Day:/)).toHaveTextContent('Jul 21');
  });

  it('reads a stored comma list from the URL', () => {
    renderDesk(multiDay, '/shows/show-1?day=2026-07-20,2026-07-22');

    expect(schedule()).toHaveTextContent('July 20');
    expect(schedule()).toHaveTextContent('July 22');
    expect(schedule()).not.toHaveTextContent('July 21');
  });
});
