import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';

import { render } from '@/test/utils/testUtils';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { Show } from '@/types/show-types';

import ShowDeskPanel from '../ShowDeskPanel';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn() },
  createDatabaseError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
}));
vi.mock('@/services/database/day-of-operations', () => ({}));
vi.mock('@/services/database/entries/lifecycle', () => ({
  restoreEntryStatus: vi.fn(),
  pullEntryDayOf: vi.fn(),
}));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { updateClass: vi.fn() },
  replicatedPaperworkPrintsTable: {
    subscribe: vi.fn(() => () => undefined),
    sync: vi.fn(async () => ({ success: true })),
    getByShow: vi.fn(async () => []),
    voidPrint: vi.fn(async () => undefined),
  },
}));
vi.mock('@/store/messageStore', () => ({
  useMessageStore: (selector: (state: { getOrCreateThread: ReturnType<typeof vi.fn>; sendMessage: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({ getOrCreateThread: vi.fn(), sendMessage: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const show = {
  id: 'show-1',
  name: 'Spring Trial',
  clubName: 'Calm Canine Club',
  organization: 'AKC',
  startDate: '2026-06-12',
  endDate: '2026-06-14',
} as Show;

const trial = fromAny<SyncableTrial, unknown>({
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Spring Trial',
  name: 'Friday AM',
  trialDate: '2026-06-12',
  trialNumber: '1',
  timezone: 'America/New_York',
  order: '1',
  status: 'In Progress',
  _version: 1,
  _lastModified: new Date(),
  _lastModifiedBy: 'test',
  _syncStatus: 'synced',
});

const now = new Date('2026-06-12T15:00:00.000Z');

describe('ShowDeskPanel cockpit', () => {
  it('places filters over a Trial-grouped schedule and focuses a selected Class', async () => {
    const { user } = render(
      <ShowDeskPanel
        show={show}
        trials={[trial]}
        classes={[
          { id: 'class-1', trialId: 'trial-1', name: 'Container Novice', status: 'Scheduled', time: '9:00 AM' },
          { id: 'class-2', trialId: 'trial-1', name: 'Interior Advanced', status: 'In Progress', time: '10:00 AM' },
        ]}
        entries={[]}
        canManageShow
        scopeNow={now}
      />,
      { initialRoute: '/shows/show-1/show-desk' }
    );

    const filters = screen.getByLabelText('Schedule filters');
    expect(within(filters).getByRole('button', { name: 'In progress' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Trial 1 · June 12/i })).toBeInTheDocument();
    expect(screen.getAllByText('Focused Class · Trial 1')).not.toHaveLength(0);
    expect(screen.getAllByRole('heading', { name: 'Interior Advanced' })).not.toHaveLength(0);

    await user.click(screen.getByText('Container Novice'));
    expect(screen.getAllByRole('heading', { name: 'Container Novice' })).not.toHaveLength(0);
  });

  it('keeps Class work available even when it is not an attention item', () => {
    render(
      <ShowDeskPanel
        show={show}
        trials={[trial]}
        classes={[{ id: 'class-1', trialId: 'trial-1', name: 'Container Novice', status: 'Scheduled' }]}
        entries={[]}
        canManageShow
        scopeNow={now}
      />,
      { initialRoute: '/shows/show-1/show-desk?focus=class-1' }
    );

    expect(screen.getAllByRole('link', { name: /view entries and results/i })[0]).toHaveAttribute(
      'href',
      expect.stringContaining('/trials/trial-1/classes/class-1')
    );
    expect(screen.getAllByRole('link', { name: /enter paper scores/i })[0]).toHaveAttribute(
      'href',
      expect.stringContaining('/scoring/classes/class-1/entries')
    );
    expect(screen.getAllByRole('link', { name: /run order and class setup/i })).not.toHaveLength(0);
    expect(screen.getAllByRole('link', { name: /class reports/i })).not.toHaveLength(0);
  });

  it('deep-links actionable entry attention to its canonical owner page', () => {
    render(
      <ShowDeskPanel
        show={show}
        trials={[trial]}
        classes={[{ id: 'class-1', trialId: 'trial-1', name: 'Container Novice', status: 'Scheduled' }]}
        entries={[{ id: 'entry-1', class_id: 'class-1', entry_status: 'submitted', check_in_status: null }]}
        canManageShow
        scopeNow={now}
      />,
      { initialRoute: '/shows/show-1/show-desk' }
    );

    const reviewLink = screen
      .getAllByRole('link')
      .find(link => link.getAttribute('href')?.includes('attention=pending'));
    expect(reviewLink).toHaveAttribute('href', expect.stringContaining('/entry-management'));
    expect(reviewLink).toHaveAttribute('href', expect.stringContaining('returnTo='));
  });

  it('renders unresolved closeout attention as information instead of a false link', () => {
    render(
      <ShowDeskPanel
        show={show}
        trials={[trial]}
        classes={[{ id: 'class-1', trialId: 'trial-1', name: 'Container Novice', status: 'Complete' }]}
        entries={[
          {
            id: 'entry-1',
            class_id: 'class-1',
            is_scored: true,
            judge_signature_timestamp: '2026-06-12T14:30:00.000Z',
          },
        ]}
        canManageShow
        scopeNow={now}
      />,
      { initialRoute: '/shows/show-1/show-desk' }
    );

    expect(screen.getAllByText('Close out 1 result')).not.toHaveLength(0);
    expect(screen.queryByRole('link', { name: /close out 1 result/i })).not.toBeInTheDocument();
  });

  it('hides staff entry attention when the viewer cannot manage the Show', () => {
    render(
      <ShowDeskPanel
        show={show}
        trials={[trial]}
        classes={[{ id: 'class-1', trialId: 'trial-1', name: 'Container Novice', status: 'Scheduled' }]}
        entries={[{ id: 'entry-1', class_id: 'class-1', entry_status: 'submitted' }]}
        canManageShow={false}
        scopeNow={now}
      />
    );

    expect(screen.queryByText('Review 1 entry')).not.toBeInTheDocument();
  });
});
