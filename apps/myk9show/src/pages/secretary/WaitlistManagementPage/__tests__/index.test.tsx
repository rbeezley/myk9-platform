/**
 * MYK9-795: the page's own bespoke search box (rendered by `WaitlistTable`'s
 * underlying `DataTable`) was replaced by the shared `ListFilterBar`, wired to
 * the same `searchTerm`/`setSearchTerm` the page already had.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import WaitlistManagementPage from '../index';

const state = vi.hoisted(() => ({ searchTerm: '' }));

vi.mock('../useWaitlistManagementData', () => ({
  useWaitlistManagementData: () => ({
    shows: [{ id: 'show-1', name: 'Test Show', start_date: null, end_date: null }],
    selectedShowId: 'show-1',
    classes: [
      {
        id: 'c1',
        name: 'Novice A',
        class_number: '1',
        max_entries: 5,
        trial_id: 't1',
        trial: { id: 't1', name: 'Trial 1', date: null },
        accepted_count: 3,
        waitlist_count: 2,
      },
    ],
    selectedClassId: 'c1',
    waitlistEntries: [{ id: 'w1' }],
    filteredEntries: state.searchTerm
      ? []
      : [
          {
            id: 'w1',
            class_id: 'c1',
            dog_id: 'd1',
            exhibitor_id: 'ex1',
            handler_id: null,
            joined_via: null,
            position: 1,
            status: 'waiting',
            offered_at: null,
            offer_expires_at: null,
            created_at: '2026-03-01T10:00:00Z',
            updated_at: '2026-03-01T10:00:00Z',
            dog: { id: 'd1', name: 'Rex', call_name: 'Rexy' },
            class: { id: 'c1', name: 'Novice A', class_number: '1', max_entries: 5 },
          },
        ],
    selectedClass: {
      id: 'c1',
      name: 'Novice A',
      class_number: '1',
      max_entries: 5,
      trial_id: 't1',
      trial: { id: 't1', name: 'Trial 1', date: null },
      accepted_count: 3,
      waitlist_count: 2,
    },
    isLoadingShows: false,
    isLoadingClasses: false,
    isLoadingWaitlist: false,
    isProcessing: false,
    error: null,
    searchTerm: state.searchTerm,
    actionDialog: { open: false, action: null, entry: null },
    setSelectedShowId: vi.fn(),
    setSelectedClassId: vi.fn(),
    setSearchTerm: vi.fn((value: string) => {
      state.searchTerm = value;
    }),
    setActionDialog: vi.fn(),
    handleOfferSpot: vi.fn(),
    handleRemoveFromWaitlist: vi.fn(),
    handleRefresh: vi.fn(),
  }),
}));

vi.mock('@/hooks/queries/useJudgeDayCapacity', () => ({
  useJudgeDayCapacity: () => ({ judgeDays: [] }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ hasRole: () => true }),
}));

vi.mock('@/components/shows/WaitListSettingsCard', () => ({
  WaitListSettingsCard: ({ showId }: { showId: string }) => (
    <div data-testid="waitlist-settings-card">settings for {showId}</div>
  ),
}));

describe('WaitlistManagementPage', () => {
  beforeEach(() => {
    state.searchTerm = '';
  });

  it('renders the shared ListFilterBar search field once a class is selected', () => {
    render(<WaitlistManagementPage showId="show-1" />);
    expect(screen.getByPlaceholderText('Search by dog...')).toBeInTheDocument();
    expect(screen.getByText('Rexy')).toBeInTheDocument();
  });

  it('narrows the table through the same searchTerm the page already owned', async () => {
    const { rerender } = render(<WaitlistManagementPage showId="show-1" />);

    fireEvent.change(screen.getByPlaceholderText('Search by dog...'), {
      target: { value: 'zz' },
    });
    // The mocked hook flips `filteredEntries` to [] once `searchTerm` is set —
    // re-render to read the store's new state, the same way a real
    // `useWaitlistManagementData` re-render would.
    rerender(<WaitlistManagementPage showId="show-1" />);

    await waitFor(() => expect(screen.queryByText('Rexy')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Showing 0 of 1 dog.');
  });

  // MYK9-999: the settings used to live only on a route nothing linked to, keyed on a store
  // selection. They are reachable from the Waitlist tab, scoped by the show it was opened for.
  it('offers Wait List Settings from the tab, keyed on the show the tab was opened for', () => {
    render(<WaitlistManagementPage showId="route-show-9" />);
    expect(screen.getByText(/Wait list settings: judge-day capacity, offer window/)).toBeVisible();
    expect(screen.getByTestId('waitlist-settings-card')).toHaveTextContent(
      'settings for route-show-9'
    );
  });
});
