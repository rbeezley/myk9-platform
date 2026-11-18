import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const db = vi.hoisted(() => ({
  update: vi.fn(),
  eq: vi.fn(),
  row: {} as Record<string, unknown>,
}));

vi.mock('./useAuthContext', () => ({ useAuthContext: () => ({ user: { id: 'auth-1' } }) }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.row, error: null }) }) }),
      update: (change: unknown) => {
        db.update(change);
        return { eq: db.eq };
      },
    }),
  },
}));
vi.mock('@/services/LoggingService', () => ({ logger: { error: vi.fn() } }));

import { useExhibitorProfile } from './useExhibitorProfile';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useExhibitorProfile.answerResultsPublicPrompt (MYK9-1944)', () => {
  beforeEach(() => {
    db.update.mockReset();
    db.eq.mockReset().mockResolvedValue({ error: null });
    db.row = {
      id: 'profile-1',
      person_id: 'p1',
      auth_user_id: 'auth-1',
      results_public: false,
      results_public_prompt_answered_at: null,
    };
  });

  it('a yes writes results_public = true and the answer time in one update', async () => {
    const { result } = renderHook(() => useExhibitorProfile(), { wrapper });
    await waitFor(() => expect(result.current.profileSettled).toBe(true));
    await act(async () => {
      await result.current.answerResultsPublicPrompt(true);
    });
    expect(db.update).toHaveBeenCalledWith({
      results_public: true,
      results_public_prompt_answered_at: expect.any(String),
    });
    expect(db.eq).toHaveBeenCalledWith('id', 'profile-1');
    await waitFor(() => expect(result.current.profile?.results_public).toBe(true));
    expect(result.current.profile?.results_public_prompt_answered_at).not.toBeNull();
  });

  it('keep private writes only the answer time and leaves results_public alone', async () => {
    const { result } = renderHook(() => useExhibitorProfile(), { wrapper });
    await waitFor(() => expect(result.current.profileSettled).toBe(true));
    await act(async () => {
      await result.current.answerResultsPublicPrompt(false);
    });
    expect(db.update).toHaveBeenCalledWith({
      results_public_prompt_answered_at: expect.any(String),
    });
    expect(db.update.mock.calls[0]?.[0]).not.toHaveProperty('results_public');
    await waitFor(() =>
      expect(result.current.profile?.results_public_prompt_answered_at).not.toBeNull()
    );
    expect(result.current.profile?.results_public).toBe(false);
  });

  it('a failed write is thrown and the profile stays unanswered', async () => {
    db.eq.mockResolvedValue({ error: new Error('offline') });
    const { result } = renderHook(() => useExhibitorProfile(), { wrapper });
    await waitFor(() => expect(result.current.profileSettled).toBe(true));
    await expect(
      act(async () => {
        await result.current.answerResultsPublicPrompt(true);
      })
    ).rejects.toThrow('offline');
    expect(result.current.profile?.results_public_prompt_answered_at).toBeNull();
    expect(result.current.profile?.results_public).toBe(false);
  });
});
