import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useWaitlistManagementData } from '../useWaitlistManagementData';
import { createTestQueryClient } from '@/test/utils/testUtils';
import {
  offerWaitlistSpot,
  getWaitlistOfferMessageTarget,
} from '@/services/database/waitlists';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), debug: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/services/database/shows', () => ({
  getSecretaryShows: vi.fn().mockResolvedValue({ data: [], error: null }),
}));

vi.mock('@/services/database/waitlists', () => ({
  getClassesWithWaitlistCounts: vi.fn().mockResolvedValue({ data: [], error: null }),
  getWaitlistByClass: vi.fn().mockResolvedValue({ data: [], error: null }),
  offerWaitlistSpot: vi.fn(),
  getWaitlistOfferMessageTarget: vi.fn(),
  removeFromWaitlist: vi.fn(),
}));

// Mock the show-messaging store the notification path reuses. The hook reads
// getOrCreateThread + sendMessage via selectors, so the mock applies the
// selector against a fake state holding those mocks.
const mockGetOrCreateThread = vi.fn();
const mockSendMessage = vi.fn();

vi.mock('@/store/messageStore', () => ({
  useMessageStore: (selector: (state: unknown) => unknown) =>
    selector({
      getOrCreateThread: mockGetOrCreateThread,
      sendMessage: mockSendMessage,
    }),
}));

const createWrapper = () => {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useWaitlistManagementData — showId sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selectedShowId defaults to empty string when no showId provided', async () => {
    const { result } = renderHook(() => useWaitlistManagementData(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoadingShows).toBe(false));
    expect(result.current.selectedShowId).toBe('');
  });

  it('selectedShowId is initialized from showId', async () => {
    const { result } = renderHook(() => useWaitlistManagementData('show-abc'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoadingShows).toBe(false));
    expect(result.current.selectedShowId).toBe('show-abc');
  });

  it('selectedShowId updates when showId changes', async () => {
    let showId = 'show-1';
    const { result, rerender } = renderHook(() => useWaitlistManagementData(showId), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.selectedShowId).toBe('show-1'));

    act(() => {
      showId = 'show-2';
    });
    rerender();

    await waitFor(() => expect(result.current.selectedShowId).toBe('show-2'));
  });

  it('selectedShowId clears when showId becomes empty string', async () => {
    let showId: string | undefined = 'show-1';
    const { result, rerender } = renderHook(() => useWaitlistManagementData(showId), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.selectedShowId).toBe('show-1'));

    act(() => {
      showId = '';
    });
    rerender();

    await waitFor(() => expect(result.current.selectedShowId).toBe(''));
  });

  it('local setSelectedShowId still overrides when user picks a different show', async () => {
    const { result } = renderHook(() => useWaitlistManagementData('show-abc'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.selectedShowId).toBe('show-abc'));

    act(() => {
      result.current.setSelectedShowId('show-xyz');
    });

    expect(result.current.selectedShowId).toBe('show-xyz');
  });
});

describe('useWaitlistManagementData — offer notification', () => {
  const sampleEntry = {
    id: 'wl-1',
    class_id: 'class-1',
    dog_id: 'dog-1',
    exhibitor_id: 'person-1',
    handler_id: null,
    position: 1,
    status: 'waiting',
    offered_at: null,
    offer_expires_at: null,
    created_at: null,
    updated_at: null,
    dog: { id: 'dog-1', name: 'Best In Show Rex', call_name: 'Rex' },
    class: {
      id: 'class-1',
      name: 'Novice A',
      class_number: '1',
      max_entries: 10,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(offerWaitlistSpot).mockResolvedValue({
      data: { exhibitor_id: 'person-1' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof offerWaitlistSpot>>);
    vi.mocked(getWaitlistOfferMessageTarget).mockResolvedValue({
      data: { participantAuthUserId: 'auth-user-9', exhibitorName: 'Jane Doe' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof getWaitlistOfferMessageTarget>>);
    mockGetOrCreateThread.mockResolvedValue({ id: 'thread-1' });
    mockSendMessage.mockResolvedValue(undefined);
  });

  it('messages the offered exhibitor by their auth account with the offer body', async () => {
    const { result } = renderHook(() => useWaitlistManagementData('show-77'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoadingShows).toBe(false));

    act(() => {
      result.current.setActionDialog({ open: true, action: 'offer', entry: sampleEntry });
    });

    await act(async () => {
      await result.current.handleOfferSpot();
    });

    // Resolves the exhibitor's messaging account from their person id.
    expect(getWaitlistOfferMessageTarget).toHaveBeenCalledWith('person-1');

    // Opens the inbox thread keyed on (showId, participant auth_user_id).
    expect(mockGetOrCreateThread).toHaveBeenCalledWith('show-77', 'auth-user-9');

    // Posts the offer message to that thread for the same show.
    expect(mockSendMessage).toHaveBeenCalledWith(
      'thread-1',
      'show-77',
      'A waitlist spot in Novice A just opened up for Rex! ' +
        'Open My Entries to accept the offer before it expires.'
    );

    // A successful in-app delivery must NOT raise the "couldn't reach" warning.
    expect(vi.mocked(toast.warning)).not.toHaveBeenCalled();
  });

  it('does not message when the offer mutation fails', async () => {
    vi.mocked(offerWaitlistSpot).mockResolvedValue({
      data: null,
      error: new Error('db down'),
    } as unknown as Awaited<ReturnType<typeof offerWaitlistSpot>>);

    const { result } = renderHook(() => useWaitlistManagementData('show-77'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoadingShows).toBe(false));

    act(() => {
      result.current.setActionDialog({ open: true, action: 'offer', entry: sampleEntry });
    });

    await act(async () => {
      await result.current.handleOfferSpot();
    });

    expect(getWaitlistOfferMessageTarget).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('skips messaging when the exhibitor has no auth account', async () => {
    vi.mocked(getWaitlistOfferMessageTarget).mockResolvedValue({
      data: { participantAuthUserId: null, exhibitorName: 'Jane Doe' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof getWaitlistOfferMessageTarget>>);

    const { result } = renderHook(() => useWaitlistManagementData('show-77'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoadingShows).toBe(false));

    act(() => {
      result.current.setActionDialog({ open: true, action: 'offer', entry: sampleEntry });
    });

    await act(async () => {
      await result.current.handleOfferSpot();
    });

    expect(mockGetOrCreateThread).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();

    // The offer is time-boxed, so the secretary must be told the exhibitor
    // could not be reached in-app — named, so they know who to contact directly.
    expect(vi.mocked(toast.warning)).toHaveBeenCalledWith(
      expect.stringContaining('Jane Doe')
    );
  });

  it('warns (but does not message) when the inbox thread cannot be opened', async () => {
    mockGetOrCreateThread.mockResolvedValue(null);

    const { result } = renderHook(() => useWaitlistManagementData('show-77'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoadingShows).toBe(false));

    act(() => {
      result.current.setActionDialog({ open: true, action: 'offer', entry: sampleEntry });
    });

    await act(async () => {
      await result.current.handleOfferSpot();
    });

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(vi.mocked(toast.warning)).toHaveBeenCalledWith(
      expect.stringContaining('Jane Doe')
    );
  });
});
