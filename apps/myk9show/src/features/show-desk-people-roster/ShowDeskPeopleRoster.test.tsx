import { screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import type { ShowPresence } from '@/features/show-presence/types';
import type { SecretaryEntry } from '@/services/database/entries';
import { ShowDeskPeopleRoster } from './ShowDeskPeopleRoster';

const h = vi.hoisted(() => ({
  updateReplicatedCheckInStatus: vi.fn(),
  getOrCreateThread: vi.fn(),
  presence: [] as ShowPresence[],
}));

vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedCheckInStatus: h.updateReplicatedCheckInStatus,
}));

vi.mock('@/features/show-presence/showPresenceContext', () => ({
  useShowPresenceRoster: () => ({ present: h.presence }),
}));

vi.mock('@/store/messageStore', () => ({
  useMessageStore: (
    selector: (state: { getOrCreateThread: typeof h.getOrCreateThread }) => unknown
  ) => selector({ getOrCreateThread: h.getOrCreateThread }),
}));

function entry(overrides: Partial<SecretaryEntry> = {}): SecretaryEntry {
  return {
    id: 'entry-1',
    dog_id: 'dog-1',
    class_id: 'class-1',
    trial_id: 'trial-1',
    show_id: 'show-1',
    handler: null,
    handler_id: 'person-1',
    payment_status: 'paid',
    entry_status: 'accepted',
    entry_fee: 25,
    submitted_at: '2026-07-08T09:00:00.000Z',
    created_at: '2026-07-08T09:00:00.000Z',
    updated_at: '2026-07-08T09:00:00.000Z',
    armband: '114',
    special_requests: null,
    jump_height: null,
    run_order: null,
    is_in_ring: null,
    is_scored: null,
    result_status: null,
    search_time_seconds: null,
    total_faults: null,
    final_placement: null,
    judge_notes: null,
    disqualification_reason: null,
    scoring_completed_at: null,
    check_in_status: 'no-status',
    withdrawal_reason: null,
    payment_method: 'online',
    refund_amount: null,
    refunded_at: null,
    stripe_payment_intent_id: null,
    registration_id: 'reg-1',
    registration: null,
    trial: { trial_type: 'scent-work' },
    handler_person: {
      id: 'person-1',
      first_name: 'Alice',
      last_name: 'Martin',
      auth_user_id: 'auth-1',
    },
    dog: {
      id: 'dog-1',
      name: 'Poppy',
      call_name: 'Poppy',
      breed: 'Beagle',
      owner: {
        id: 'person-1',
        first_name: 'Alice',
        last_name: 'Martin',
        email: 'alice@example.com',
        auth_user_id: 'auth-1',
      },
    },
    class: {
      id: 'class-1',
      name: 'Container Novice A',
      class_number: '1',
      max_entries: 50,
    },
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderRoster(
  entries: SecretaryEntry[] = [entry()],
  options: {
    currentDate?: Date | null;
    trialDate?: string;
    loadError?: unknown;
    onRetry?: () => void;
  } = {}
) {
  if (!h.updateReplicatedCheckInStatus.getMockImplementation()) {
    h.updateReplicatedCheckInStatus.mockResolvedValue(undefined);
  }
  if (!h.getOrCreateThread.getMockImplementation()) {
    h.getOrCreateThread.mockResolvedValue({
      id: 'thread-1',
      show_id: 'show-1',
      participant_id: 'auth-1',
      created_at: '2026-07-08T09:00:00.000Z',
      last_message_at: '2026-07-08T09:00:00.000Z',
    });
  }

  return render(
    <>
      <ShowDeskPeopleRoster
        showId="show-1"
        entries={entries}
        loadError={options.loadError}
        onRetry={options.onRetry}
        currentDate={options.currentDate ?? new Date('2026-07-08T15:00:00.000Z')}
        classes={[
          {
            id: 'class-1',
            name: 'Container Novice A',
            element: 'Container',
            level: 'Novice A',
            section: '',
            judgeName: '',
            trialId: 'trial-1',
            time: '9:00 AM',
            status: 'scheduled',
            entryCount: 1,
            scoredCount: 0,
            trialDate: options.trialDate ?? '2026-07-08',
            timezone: 'America/Chicago',
            trialNumber: '1',
            trialName: 'Trial 1',
          },
        ]}
      />
      <LocationProbe />
    </>,
    { initialRoute: '/shows/show-1/show-desk' }
  );
}

describe('ShowDeskPeopleRoster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.presence = [];
  });

  it('renders all exhibitors by default and expands/collapses one person row', async () => {
    const { user, container } = renderRoster();

    expect(await screen.findByRole('button', { name: /alice martin/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /all exhibitors/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /alice martin/i }));
    expect(screen.getByText('Poppy')).toBeInTheDocument();
    expect(screen.getByText(/Container Novice A - 9:00 AM/i)).toBeInTheDocument();
    expect(screen.getByText('114')).toBeInTheDocument();
    expect(
      container.querySelector('[data-status="not_checked_in"][data-shape="not-started"]')
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /alice martin/i }));
    expect(screen.queryByText('Poppy')).not.toBeInTheDocument();
  });

  it('shows a retryable error instead of a false empty roster when entries fail to load', async () => {
    const onRetry = vi.fn();
    const { user } = renderRoster([], {
      loadError: new Error('Replica unavailable'),
      onRetry,
    });

    expect(screen.getByText("Couldn't load exhibitors.")).toBeInTheDocument();
    expect(screen.getByText('Replica unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/No exhibitors are entered/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('checks in an eligible class row through the replicated path', async () => {
    const { user } = renderRoster();

    await user.click(await screen.findByRole('button', { name: /alice martin/i }));
    await user.click(screen.getByRole('button', { name: /^check in$/i }));

    await waitFor(() => {
      expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'checked-in');
    });
    expect(await screen.findByText('Checked-in')).toBeInTheDocument();
  });

  it('checks in all eligible rows without touching ineligible rows', async () => {
    const { user } = renderRoster([
      entry(),
      entry({
        id: 'entry-2',
        dog_id: 'dog-2',
        armband: '115',
        check_in_status: 'checked-in',
      }),
    ]);

    await user.click(await screen.findByRole('button', { name: /alice martin/i }));
    await user.click(screen.getByRole('button', { name: /check in all eligible/i }));

    await waitFor(() => {
      expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledTimes(1);
      expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'checked-in');
    });
  });

  it('routes message and manage-entry actions to the handler when owner differs', async () => {
    h.getOrCreateThread.mockResolvedValueOnce({
      id: 'thread-handler',
      show_id: 'show-1',
      participant_id: 'auth-handler',
      created_at: '2026-07-08T09:00:00.000Z',
      last_message_at: '2026-07-08T09:00:00.000Z',
    });
    const first = renderRoster([
      entry({
        handler_id: 'handler-1',
        handler_person: {
          id: 'handler-1',
          first_name: 'Casey',
          last_name: 'Handler',
          auth_user_id: 'auth-handler',
        },
        dog: {
          id: 'dog-1',
          name: 'Poppy',
          call_name: 'Poppy',
          breed: 'Beagle',
          owner: {
            id: 'owner-1',
            first_name: 'Alice',
            last_name: 'Owner',
            email: 'alice@example.com',
            auth_user_id: 'auth-owner',
          },
        },
      }),
    ]);

    await first.user.click(await screen.findByRole('button', { name: /casey handler/i }));
    await first.user.click(screen.getByRole('button', { name: /message/i }));

    await waitFor(() => {
      expect(h.getOrCreateThread).toHaveBeenCalledWith('show-1', 'auth-handler');
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/secretary/messages?showId=show-1&threadId=thread-handler'
      );
    });
    first.unmount();

    const second = renderRoster([
      entry({
        handler_id: 'handler-1',
        handler_person: {
          id: 'handler-1',
          first_name: 'Casey',
          last_name: 'Handler',
          auth_user_id: 'auth-handler',
        },
        dog: {
          id: 'dog-1',
          name: 'Poppy',
          call_name: 'Poppy',
          breed: 'Beagle',
          owner: {
            id: 'owner-1',
            first_name: 'Alice',
            last_name: 'Owner',
            email: 'alice@example.com',
            auth_user_id: 'auth-owner',
          },
        },
      }),
    ]);

    await second.user.click(await screen.findByRole('button', { name: /casey handler/i }));
    await second.user.click(screen.getByRole('button', { name: /manage entries/i }));

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/shows/show-1/entry-management?person=Casey%20Handler'
    );
  });

  it('does not silently message the owner from a handler row without handler auth', async () => {
    const { user } = renderRoster([
      entry({
        handler_id: 'handler-1',
        handler_person: {
          id: 'handler-1',
          first_name: 'Casey',
          last_name: 'Handler',
          auth_user_id: null,
        },
        dog: {
          id: 'dog-1',
          name: 'Poppy',
          call_name: 'Poppy',
          breed: 'Beagle',
          owner: {
            id: 'owner-1',
            first_name: 'Alice',
            last_name: 'Owner',
            email: 'alice@example.com',
            auth_user_id: 'auth-owner',
          },
        },
      }),
    ]);

    await user.click(await screen.findByRole('button', { name: /casey handler/i }));

    expect(screen.getByRole('button', { name: /message/i })).toBeDisabled();
    expect(screen.getByText(/no message-capable account/i)).toBeInTheDocument();
    expect(h.getOrCreateThread).not.toHaveBeenCalled();
  });

  it('keeps a failed check-in actionable and shows retry feedback', async () => {
    h.updateReplicatedCheckInStatus.mockRejectedValueOnce(new Error('offline'));
    const { user } = renderRoster();

    await user.click(await screen.findByRole('button', { name: /alice martin/i }));
    await user.click(screen.getByRole('button', { name: /^check in$/i }));

    expect(await screen.findByText(/couldn't check in alice martin/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^check in$/i })).toBeEnabled();
  });

  it('navigates Message and Manage entries to canonical surfaces', async () => {
    const first = renderRoster();

    await first.user.click(await screen.findByRole('button', { name: /alice martin/i }));
    await first.user.click(screen.getByRole('button', { name: /message/i }));

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/secretary/messages?showId=show-1&threadId=thread-1'
      );
    });
    first.unmount();

    const second = renderRoster();
    await second.user.click(await screen.findByRole('button', { name: /alice martin/i }));
    await second.user.click(screen.getByRole('button', { name: /manage entries/i }));

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/shows/show-1/entry-management?person=Alice%20Martin'
    );
  });

  it('shows an empty state inside the tool', async () => {
    renderRoster([]);
    expect(await screen.findByText(/No exhibitors are entered/i)).toBeInTheDocument();
  });

  it('shows a no-results state inside the tool', async () => {
    const { user } = renderRoster();
    expect(await screen.findByRole('button', { name: /alice martin/i })).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /search exhibitors/i }), 'zzz');

    expect(screen.getByText(/No exhibitors match this view/i)).toBeInTheDocument();
  });

  it('does not offer direct check-in for a future-day class', async () => {
    const { user } = renderRoster([entry()], {
      currentDate: new Date('2026-07-08T15:00:00.000Z'),
      trialDate: '2026-07-09',
    });

    await user.click(await screen.findByRole('button', { name: /alice martin/i }));

    expect(screen.queryByRole('button', { name: /^check in$/i })).not.toBeInTheDocument();
    expect(screen.getByText('Not today')).toBeInTheDocument();
  });

  it('collapses the expanded person when search changes', async () => {
    const { user } = renderRoster();

    await user.click(await screen.findByRole('button', { name: /alice martin/i }));
    expect(screen.getByText('Poppy')).toBeInTheDocument();

    const search = screen.getByRole('textbox', { name: /search exhibitors/i });
    await user.type(search, 'zzz');
    expect(screen.getByText(/No exhibitors match this view/i)).toBeInTheDocument();

    await user.clear(search);
    expect(await screen.findByRole('button', { name: /alice martin/i })).toBeInTheDocument();
    expect(screen.queryByText('Poppy')).not.toBeInTheDocument();
  });
});
