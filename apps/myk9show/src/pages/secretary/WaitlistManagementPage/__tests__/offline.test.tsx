/**
 * The waitlist reads come from the replica, so the tab must work offline. The app's query client
 * defaults to networkMode 'online', which parks a query offline (pending + paused) and never calls
 * its reader. Real query lifecycle here: no mocked useJudgeDayCapacity, a fresh cache, offline.
 */
import { onlineManager } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { NetworkStatusContext } from '@/hooks/useNetworkStatus';
import WaitlistManagementPage from '../index';

vi.mock('@/services/database/waitlists', () => ({
  getClassesWithWaitlistCounts: vi.fn().mockResolvedValue({
    data: [
      {
        id: 'c1',
        name: 'Novice A',
        class_number: '1',
        max_entries: null,
        trial_id: 't1',
        trial: { id: 't1', name: 'Trial 1', date: '2026-10-10' },
        accepted_count: 1,
        waitlist_count: 1,
      },
    ],
    error: null,
  }),
  getWaitlistByClass: vi.fn().mockResolvedValue({
    data: [
      {
        id: 'w1',
        class_id: 'c1',
        dog_id: 'd1',
        exhibitor_id: 'e1',
        handler_id: null,
        joined_via: null,
        position: 1,
        status: 'waiting',
        offered_at: null,
        offer_expires_at: null,
        created_at: '2026-03-01T10:00:00Z',
        updated_at: '2026-03-01T10:00:00Z',
        dog: { id: 'd1', name: 'Bella', call_name: 'Bella' },
        class: { id: 'c1', name: 'Novice A', class_number: '1', max_entries: null },
      },
    ],
    error: null,
  }),
  promoteWaitlistEntry: vi.fn(),
  removeFromWaitlist: vi.fn(),
  sendWaitlistOfferMessage: vi.fn(),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ hasRole: () => true }),
}));

vi.mock('@/components/shows/WaitListSettingsCard', () => ({
  WaitListSettingsCard: () => <div />,
}));

describe('WaitlistManagementPage offline', () => {
  beforeEach(() => {
    onlineManager.setOnline(false);
  });
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('reads the wait lists from the replica and says the capacity cards are unavailable', async () => {
    render(<WaitlistManagementPage showId="show-1" />);

    expect(await screen.findByText('Bella')).toBeInTheDocument();
    expect(screen.getByTestId('judge-day-capacity-offline')).toBeInTheDocument();
    expect(screen.queryByText(/spots? available/)).not.toBeInTheDocument();
  });

  it('disables Offer Spot and Remove, saying they are online only, when the app is offline', async () => {
    render(
      <NetworkStatusContext.Provider
        value={{
          isOnline: false,
          quality: null,
          showOfflineMessage: true,
          retryConnection: vi.fn(),
        }}
      >
        <WaitlistManagementPage showId="show-1" />
      </NetworkStatusContext.Provider>
    );

    await screen.findByText('Bella');
    expect(screen.getByRole('button', { name: /Offer Spot/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Remove/ })).toBeDisabled();
    expect(screen.getByTestId('waitlist-online-only')).toHaveTextContent('Online only');
  });

  it('leaves Offer Spot and Remove enabled when online', async () => {
    onlineManager.setOnline(true);
    render(<WaitlistManagementPage showId="show-1" />);

    await screen.findByText('Bella');
    expect(screen.getByRole('button', { name: /Offer Spot/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Remove/ })).toBeEnabled();
    expect(screen.queryByTestId('waitlist-online-only')).not.toBeInTheDocument();
  });
});
