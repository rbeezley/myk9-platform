import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const db = vi.hoisted(() => ({
  update: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
  eqPrivate: vi.fn(),
  select: vi.fn(),
  fetches: 0,
  row: {} as Record<string, unknown>,
}));

vi.mock('./useAuthContext', () => ({ useAuthContext: () => ({ user: { id: 'auth-1' } }) }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            db.fetches += 1;
            return { data: db.row, error: null };
          },
        }),
      }),
      update: (change: unknown) => {
        db.update(change);
        return {
          eq: (...args: unknown[]) => {
            db.eq(...args);
            return {
              is: (...isArgs: unknown[]) => {
                db.is(...isArgs);
                return {
                  eq: (...privArgs: unknown[]) => {
                    db.eqPrivate(...privArgs);
                    return { select: (...selArgs: unknown[]) => db.select(...selArgs) };
                  },
                };
              },
            };
          },
        };
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
    db.eq.mockReset();
    db.is.mockReset();
    db.eqPrivate.mockReset();
    db.fetches = 0;
    db.select.mockReset().mockResolvedValue({ data: [{ id: 'profile-1' }], error: null });
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
    db.select.mockResolvedValue({ data: null, error: new Error('offline') });
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

  it('the write only matches a still-unanswered, still-private profile', async () => {
    const { result } = renderHook(() => useExhibitorProfile(), { wrapper });
    await waitFor(() => expect(result.current.profileSettled).toBe(true));
    await act(async () => {
      await result.current.answerResultsPublicPrompt(true);
    });
    expect(db.is).toHaveBeenCalledWith('results_public_prompt_answered_at', null);
    expect(db.eqPrivate).toHaveBeenCalledWith('results_public', false);
    expect(db.select).toHaveBeenCalledWith('id');
  });

  it('when nothing updated, refetches and shows the current profile instead of confirming from cache', async () => {
    const { result } = renderHook(() => useExhibitorProfile(), { wrapper });
    await waitFor(() => expect(result.current.profileSettled).toBe(true));
    const fetchesBefore = db.fetches;
    db.select.mockResolvedValue({ data: [], error: null });
    // Another device already turned the setting on and answered.
    db.row = {
      ...db.row,
      results_public: true,
      results_public_prompt_answered_at: '2026-11-17T00:00:00Z',
    };
    let saved: string | null = 'unset';
    await act(async () => {
      saved = await result.current.answerResultsPublicPrompt(false);
    });
    expect(saved).toBeNull();
    expect(db.fetches).toBe(fetchesBefore + 1);
    await waitFor(() => expect(result.current.profile?.results_public).toBe(true));
    expect(result.current.profile?.results_public_prompt_answered_at).toBe('2026-11-17T00:00:00Z');
  });
});
