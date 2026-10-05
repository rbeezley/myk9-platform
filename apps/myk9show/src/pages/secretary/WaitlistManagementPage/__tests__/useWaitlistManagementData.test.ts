import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useWaitlistManagementData } from '../useWaitlistManagementData';
import { createTestQueryClient } from '@/test/utils/testUtils';
import type { WaitlistEntry } from '../types';
import { supabase } from '@/lib/supabase';
import {
  getWaitlistByClass,
  promoteWaitlistEntry,
  removeFromWaitlist,
  sendWaitlistOfferMessage,
} from '@/services/database/waitlists';
import {
  WaitlistEntryNotDeletedError,
  WAITLIST_ENTRY_GONE_MESSAGE,
} from '@/services/database/waitlists/deleteWaitlistEntryErrors';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
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
  promoteWaitlistEntry: vi.fn(),
  removeFromWaitlist: vi.fn(),
  sendWaitlistOfferMessage: vi.fn(),
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
    joined_via: 'online' as const,
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
    vi.mocked(promoteWaitlistEntry).mockResolvedValue('pending-payment-entry-1');
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { url: 'https://checkout.stripe.com/c/pay/cs_waitlist_1' },
      error: null,
    });
    vi.mocked(sendWaitlistOfferMessage).mockResolvedValue('sent');
  });

  async function offer(entry: WaitlistEntry = sampleEntry) {
    const { result } = renderHook(() => useWaitlistManagementData('show-77'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isLoadingShows).toBe(false));
    act(() => {
      result.current.setActionDialog({ open: true, action: 'offer', entry });
    });
    await act(async () => {
      await result.current.handleOfferSpot();
    });
    return { result };
  }

  // MYK9-1003: the database writes the message (send_waitlist_offer_message),
  // through the same function an automatic offer uses.
  it('sends the in-app message through the database with the payment link', async () => {
    await offer();

    expect(supabase.functions.invoke).toHaveBeenCalledWith('stripe-payment-link', {
      body: {
        entry_ids: ['pending-payment-entry-1'],
        success_url: 'http://localhost:3000/shows/show-77?payment=success',
        cancel_url: 'http://localhost:3000/shows/show-77?payment=cancelled',
      },
    });
    expect(sendWaitlistOfferMessage).toHaveBeenCalledWith(
      'wl-1',
      'https://checkout.stripe.com/c/pay/cs_waitlist_1'
    );
    // A successful in-app delivery must NOT raise the "couldn't reach" warning.
    expect(vi.mocked(toast.warning)).not.toHaveBeenCalled();
  });

  it('shows the database refusal when the trial has already taken place', async () => {
    const message = 'This trial has already taken place, so its wait list spots cannot be offered.';
    vi.mocked(promoteWaitlistEntry).mockRejectedValue(
      Object.assign(new Error(message), { code: '22023' })
    );
    const { result } = await offer();
    expect(result.current.error).toBe(message);
  });

  it('keeps the generic message for any other offer failure', async () => {
    vi.mocked(promoteWaitlistEntry).mockRejectedValue(new Error('db down'));
    const { result } = await offer();
    expect(result.current.error).toBe('Failed to offer spot. Please try again.');
  });

  it('does not message when the offer mutation fails', async () => {
    vi.mocked(promoteWaitlistEntry).mockRejectedValue(new Error('db down'));
    await offer();
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
    expect(sendWaitlistOfferMessage).not.toHaveBeenCalled();
  });

  it('still messages, without a link, when payment link creation fails', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: new Error('link failed'),
    });
    await offer();
    expect(toast.warning).toHaveBeenCalledWith(
      'Spot offered, but the payment link could not be created. Request payment from the entry list.'
    );
    expect(sendWaitlistOfferMessage).toHaveBeenCalledWith('wl-1', null);
  });

  it('does not create an online payment link for mail-in waitlist rows', async () => {
    await offer({ ...sampleEntry, joined_via: 'mail_in' });
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
    expect(sendWaitlistOfferMessage).toHaveBeenCalledWith('wl-1', null);
  });

  // The offer is time-boxed, so the secretary must be told the exhibitor could
  // not be reached in-app, to contact them another way.
  it('tells the secretary when the exhibitor has no app account', async () => {
    vi.mocked(sendWaitlistOfferMessage).mockResolvedValue('no_account');
    await offer();
    expect(vi.mocked(toast.warning)).toHaveBeenCalledWith(
      'Spot offered. This exhibitor has no app account yet — notify them directly.'
    );
  });

  it('tells the secretary when the message could not be sent', async () => {
    vi.mocked(sendWaitlistOfferMessage).mockRejectedValue(new Error('network'));
    await offer();
    expect(vi.mocked(toast.warning)).toHaveBeenCalledWith(
      "Spot offered, but the in-app notification didn't send."
    );
  });
});

// MYK9-1000 Codex round 2: a Remove that deleted nothing (already removed or
// claimed elsewhere) must not read as a success, nor as a generic failure.
describe('useWaitlistManagementData — remove that deleted nothing', () => {
  const entry = {
    id: 'wl-9',
    class_id: 'class-1',
    dog_id: 'dog-1',
    exhibitor_id: 'person-1',
    handler_id: null,
    position: 1,
    status: 'waiting',
    joined_via: 'online' as const,
    offered_at: null,
    offer_expires_at: null,
    created_at: null,
    updated_at: null,
  } as WaitlistEntry;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function remove() {
    const { result } = renderHook(() => useWaitlistManagementData('show-77'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isLoadingShows).toBe(false));
    act(() => {
      result.current.setSelectedClassId('class-1');
      result.current.setActionDialog({ open: true, action: 'remove', entry });
    });
    vi.mocked(getWaitlistByClass).mockClear();
    await act(async () => {
      await result.current.handleRemoveFromWaitlist();
    });
    return { result };
  }

  it('reloads the list and says the dog is no longer on it', async () => {
    vi.mocked(removeFromWaitlist).mockResolvedValue({
      data: null,
      error: new WaitlistEntryNotDeletedError(WAITLIST_ENTRY_GONE_MESSAGE),
    });

    const { result } = await remove();

    expect(getWaitlistByClass).toHaveBeenCalledWith('class-1');
    expect(result.current.error).toBe(WAITLIST_ENTRY_GONE_MESSAGE);
  });

  it('keeps the generic message for a real failure', async () => {
    vi.mocked(removeFromWaitlist).mockResolvedValue({
      data: null,
      error: Object.assign(new Error('db down'), { name: 'DatabaseError' }) as never,
    });

    const { result } = await remove();

    expect(result.current.error).toBe('Failed to remove from waitlist. Please try again.');
  });
});
