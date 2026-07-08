import { screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import type { ShowPresence } from '@/features/show-presence/types';
import type { SecretaryEntry } from '@/services/database/entries';
import { ShowDeskPeopleRoster } from './ShowDeskPeopleRoster';

const h = vi.hoisted(() => ({
  getEntriesForShow: vi.fn(),
  updateReplicatedCheckInStatus: vi.fn(),
  getOrCreateThread: vi.fn(),
  presence: [] as ShowPresence[],
}));

vi.mock('@/services/database/entries', () => ({
  getEntriesForShow: h.getEntriesForShow,
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

function renderRoster(entries: SecretaryEntry[] = [entry()]) {
  h.getEntriesForShow.mockResolvedValue({ data: entries, error: null });
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
            trialDate: '2026-07-08',
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
    const { user } = renderRoster();

    expect(await screen.findByRole('button', { name: /alice martin/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /all exhibitors/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /alice martin/i }));
    expect(screen.getByText('Poppy')).toBeInTheDocument();
    expect(screen.getByText(/Container Novice A - 9:00 AM/i)).toBeInTheDocument();
    expect(screen.getByText('114')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /alice martin/i }));
    expect(screen.queryByText('Poppy')).not.toBeInTheDocument();
  });

  it('checks in an eligible class row through the replicated path', async () => {
    const { user } = renderRoster();

    await user.click(await screen.findByRole('button', { name: /alice martin/i }));
    await user.click(screen.getByRole('button', { name: /^check in$/i }));

    await waitFor(() => {
      expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'checked-in');
    });
    expect(await screen.findAllByText('Checked in')).toHaveLength(2);
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
});
