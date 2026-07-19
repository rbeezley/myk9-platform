import { screen, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import ShowDeskPanel from '../ShowDeskPanel';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import { fromAny } from '@total-typescript/shoehorn';

const mockMessageStore = vi.hoisted(() => ({
  getOrCreateThread: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
  createDatabaseError: (err: unknown) => (err instanceof Error ? err : new Error(String(err))),
}));

vi.mock('@/services/database/day-of-operations', () => ({}));

vi.mock('@/services/database/entries/lifecycle', () => ({
  restoreEntryStatus: vi.fn(),
  pullEntryDayOf: vi.fn(),
}));

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: {
    updateClass: vi.fn(),
  },
}));

vi.mock('@/store/messageStore', () => ({
  useMessageStore: (selector: (state: typeof mockMessageStore) => unknown) =>
    selector(mockMessageStore),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const show = {
  id: 'show-1',
  name: 'Spring Trial',
  clubName: 'Calm Canine Club',
  organization: 'AKC',
  startDate: '2026-06-12',
  endDate: '2026-06-14',
} as Show;

const futureTrial = fromAny<SyncableTrial, unknown>({
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Spring Trial',
  trialDate: '2026-06-12',
  trialNumber: '1',
  timezone: 'America/New_York',
  status: 'Not Started',
  _version: 1,
  _lastModified: new Date(),
  _lastModifiedBy: 'test',
  _syncStatus: 'synced',
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="current-location">{`${location.pathname}${location.search}`}</div>;
}

describe('ShowDeskPanel', () => {
  it('uses scopeNow for status summary attention counts', () => {
    render(
      <ShowDeskPanel
        show={show}
        trials={[futureTrial]}
        classes={[
          {
            id: 'class-needs-signature',
            trialId: 'trial-1',
            name: 'Container Novice A',
            status: 'Complete',
          },
        ]}
        entries={[
          {
            id: 'entry-needs-signature',
            class_id: 'class-needs-signature',
            is_scored: true,
          },
        ]}
        canManageShow
        scopeNow={new Date('2026-05-28T15:00:00.000Z')}
      />
    );

    const status = screen.getByRole('region', { name: /show status/i });
    expect(within(status).getByTestId('show-desk-status-pill')).toHaveTextContent(
      'Show in progress'
    );
    expect(within(status).getByText('1 of 1 classes complete')).toBeInTheDocument();
    expect(within(status).queryByText(/attention/i)).not.toBeInTheDocument();
  });

  it('deep-links pending-review entry management to the pending tab', async () => {
    const { user } = render(
      <>
        <ShowDeskPanel
          show={show}
          trials={[futureTrial]}
          classes={[
            {
              id: 'class-1',
              trialId: 'trial-1',
              name: 'Container Novice A',
              status: 'Not Started',
            },
          ]}
          entries={[
            {
              id: 'entry-1',
              class_id: 'class-1',
              entry_status: 'submitted',
              check_in_status: null,
            },
          ]}
          canManageShow
          scopeNow={new Date('2026-05-28T15:00:00.000Z')}
        />
        <LocationProbe />
      </>,
      { initialRoute: '/secretary/show-map/show-1' }
    );

    // The verb-first chip is the single route to pending-review work — the
    // old duplicate "Manage entries (N)" button is gone (MYK9-64 F1).
    expect(screen.queryByTestId('open-entry-management')).toBeNull();
    await user.click(screen.getByRole('button', { name: /review 1 entry/i }));

    expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/shows/show-1/entry-management?mode=review&attention=pending'
    );
  });

  it('routes pending closeout signals to Results & Check-In', async () => {
    const { user } = render(
      <>
        <ShowDeskPanel
          show={show}
          trials={[futureTrial]}
          classes={[
            {
              id: 'class-ready',
              trialId: 'trial-1',
              name: 'Container Novice A',
              status: 'Complete',
            },
          ]}
          entries={[
            {
              id: 'entry-ready',
              class_id: 'class-ready',
              is_scored: true,
              judge_signature_timestamp: '2026-06-12T15:00:00.000Z',
            },
          ]}
          canManageShow
          scopeNow={new Date('2026-06-12T15:00:00.000Z')}
        />
        <LocationProbe />
      </>,
      { initialRoute: '/shows/show-1/show-desk' }
    );

    await user.click(screen.getByRole('button', { name: /close out 1 result/i }));

    expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/shows/show-1/results-control'
    );
  });

  it('navigates the payment-due chip to its Entry Management href, not a local filter', async () => {
    const { user } = render(
      <>
        <ShowDeskPanel
          show={show}
          trials={[futureTrial]}
          classes={[
            {
              id: 'class-1',
              trialId: 'trial-1',
              name: 'Container Novice A',
              status: 'Not Started',
            },
          ]}
          entries={[
            {
              id: 'entry-payment-due',
              class_id: 'class-1',
              entry_status: 'accepted',
              check_in_status: 'checked-in',
              payment_status: 'pending',
            },
          ]}
          canManageShow
          scopeNow={new Date('2026-05-28T15:00:00.000Z')}
        />
        <LocationProbe />
      </>,
      { initialRoute: '/shows/show-1/show-desk' }
    );

    await user.click(screen.getByRole('button', { name: /resolve 1 payment/i }));

    expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/shows/show-1/entry-management'
    );
    expect(screen.getByTestId('current-location')).toHaveTextContent('payment=pending');
  });

  it('keeps the entries-waiting-checkin chip as a local Show Map filter, not a navigation', async () => {
    const { user } = render(
      <>
        <ShowDeskPanel
          show={show}
          trials={[futureTrial]}
          classes={[
            {
              id: 'class-1',
              trialId: 'trial-1',
              name: 'Container Novice A',
              status: 'Not Started',
            },
          ]}
          entries={[
            {
              id: 'entry-checkin',
              class_id: 'class-1',
              entry_status: 'accepted',
              check_in_status: null,
            },
          ]}
          canManageShow
          scopeNow={new Date('2026-05-28T15:00:00.000Z')}
        />
        <LocationProbe />
      </>,
      { initialRoute: '/shows/show-1/show-desk' }
    );

    const before = screen.getByTestId('current-location').textContent;
    await user.click(screen.getByRole('button', { name: /check in 1 entry/i }));

    // Clicking the check-in chip sets a local Show Map filter — it must not
    // navigate away from the Show Desk route the way payment-due does.
    expect(screen.getByTestId('current-location').textContent).toBe(before);
  });

  it('hides staff pending signals and their click handler when canManageShow is false', () => {
    render(
      <ShowDeskPanel
        show={show}
        trials={[futureTrial]}
        classes={[
          {
            id: 'class-1',
            trialId: 'trial-1',
            name: 'Container Novice A',
            status: 'Not Started',
          },
        ]}
        entries={[
          {
            id: 'entry-1',
            class_id: 'class-1',
            entry_status: 'submitted',
            check_in_status: null,
          },
        ]}
        canManageShow={false}
        scopeNow={new Date('2026-05-28T15:00:00.000Z')}
      />
    );

    expect(screen.queryByTestId('show-desk-pending-signals')).toBeNull();
  });

  it('lists only Class Management in related links — Entry Management already has its primary routes (MYK9-64 F2)', () => {
    render(
      <ShowDeskPanel
        show={show}
        trials={[futureTrial]}
        classes={[
          {
            id: 'class-1',
            trialId: 'trial-1',
            name: 'Container Novice A',
            status: 'Not Started',
          },
        ]}
        entries={[]}
        canManageShow
        scopeNow={new Date('2026-05-28T15:00:00.000Z')}
      />
    );

    const related = screen.getByRole('navigation', { name: /related context/i });
    expect(within(related).getByRole('link', { name: /class management/i })).toBeInTheDocument();
    expect(within(related).queryByRole('link', { name: /entry management/i })).toBeNull();
  });

  it('navigates a running-now card straight to Class Details (MYK9-64 F4)', async () => {
    const { user } = render(
      <>
        <ShowDeskPanel
          show={show}
          trials={[futureTrial]}
          classes={[
            {
              id: 'class-1',
              trialId: 'trial-1',
              name: 'Container Novice A',
              status: 'In Progress',
            },
          ]}
          entries={[]}
          canManageShow
          scopeNow={new Date('2026-05-28T15:00:00.000Z')}
        />
        <LocationProbe />
      </>,
      { initialRoute: '/shows/show-1/show-desk' }
    );

    const running = screen.getByRole('region', { name: /running now/i });
    await user.click(within(running).getByText('Container Novice A'));

    expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/shows/show-1/trials/trial-1/classes/class-1'
    );
  });
});
