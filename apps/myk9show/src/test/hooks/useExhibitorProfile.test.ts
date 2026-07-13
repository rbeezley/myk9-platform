/**
 * Unit tests for useExhibitorProfile hook
 * Tests profile fetching, creation, and derived state
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';

// Mock user from auth context
const mockUser = { id: 'user-123', email: 'test@example.com' };
let currentUser: typeof mockUser | null = mockUser;

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: currentUser }),
}));

// Mock Supabase. select() captures its argument so tests can branch on whether
// the optional early_adopter_until column was requested (the fallback path).
const mockSupabaseQuery = vi.fn();
const mockSupabaseInsert = vi.fn();
const mockSupabaseUpdate = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: (selectArg?: string) => ({
        eq: (column: string, value: string) => ({
          maybeSingle: () =>
            mockSupabaseQuery(table, 'maybeSingle', { column, value, select: selectArg }),
          single: () => mockSupabaseQuery(table, 'single', { column, value, select: selectArg }),
        }),
      }),
      insert: (data: Record<string, unknown>) => ({
        select: () => ({
          single: () => mockSupabaseInsert(table, data),
        }),
      }),
      update: (data: Record<string, unknown>) => ({
        eq: (column: string, value: string) =>
          mockSupabaseUpdate(table, data, {
            column,
            value,
          }),
      }),
    }),
  },
}));

// Create a wrapper component with QueryClient
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

function createWrapper(queryClient = createQueryClient()) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useExhibitorProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = mockUser;

    // Default mock responses
    mockSupabaseQuery.mockResolvedValue({ data: null, error: null });
    mockSupabaseInsert.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('onboarding completion', () => {
    it('updates cached profile completion state before refetch so completion redirect cannot see stale state', async () => {
      const mockProfile = {
        id: 'profile-123',
        person_id: 'person-456',
        auth_user_id: 'user-123',
        default_handler_id: null,
        subscription_tier: 'free',
        subscription_expires_at: null,
        stripe_customer_id: null,
        onboarding_completed_at: null,
        created_at: '2026-07-06T00:00:00.000Z',
        updated_at: '2026-07-06T00:00:00.000Z',
      };

      mockSupabaseQuery.mockResolvedValue({ data: mockProfile, error: null });
      mockSupabaseUpdate.mockResolvedValue({ error: null });
      const queryClient = createQueryClient();

      const { result } = renderHook(() => useExhibitorProfile(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const completedAt = await result.current.completeOnboarding();

      expect(completedAt).toEqual(expect.any(String));
      expect(
        queryClient.getQueryData<{ onboarding_completed_at: string | null }>([
          'exhibitorProfile',
          'user-123',
        ])?.onboarding_completed_at
      ).toBe(completedAt);
      expect(mockSupabaseUpdate).toHaveBeenCalledWith(
        'exhibitor_profiles',
        { onboarding_completed_at: completedAt },
        { column: 'id', value: 'profile-123' }
      );
    });
  });

  describe('initial state', () => {
    it('should return loading state initially when user is logged in', async () => {
      const { result } = renderHook(() => useExhibitorProfile(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.profile).toBeUndefined();
    });

    it('should not fetch when user is not logged in', async () => {
      currentUser = null;

      const { result } = renderHook(() => useExhibitorProfile(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockSupabaseQuery).not.toHaveBeenCalled();
    });
  });

  describe('profile fetching', () => {
    it('should fetch profile for logged in user', async () => {
      const mockProfile = {
        id: 'profile-123',
        person_id: 'person-456',
        auth_user_id: 'user-123',
        subscription_tier: 'free',
        person: {
          id: 'person-456',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
          phone: null,
        },
      };

      mockSupabaseQuery.mockResolvedValue({ data: mockProfile, error: null });

      const { result } = renderHook(() => useExhibitorProfile(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Check key properties (mapping function adds defaults for missing fields)
      expect(result.current.profile?.id).toBe('profile-123');
      expect(result.current.profile?.person_id).toBe('person-456');
      expect(result.current.profile?.auth_user_id).toBe('user-123');
      expect(result.current.profile?.subscription_tier).toBe('free');
      expect(result.current.profile?.person?.first_name).toBe('John');
      expect(result.current.hasProfile).toBe(true);
      expect(result.current.needsOnboarding).toBe(false);
    });

    it('should handle fetch error', async () => {
      const mockError = new Error('Database error');
      mockSupabaseQuery.mockResolvedValue({ data: null, error: mockError });

      const { result } = renderHook(() => useExhibitorProfile(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
    });
  });

  // QA-NETWORK-ERROR-018: a DB without the early_adopter_until migration
  // returns Postgres 42703 / HTTP 400 for the nested person select. The hook
  // must fail safe — retry without the column, load the profile, and NOT throw
  // (which would false-trigger the onboarding redirect via needsOnboarding).
  describe('early_adopter_until column resilience', () => {
    function makeProfile(earlyAdopterUntil: string | null) {
      return {
        id: 'profile-123',
        person_id: 'person-456',
        auth_user_id: 'user-123',
        subscription_tier: 'free',
        person: {
          id: 'person-456',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
          phone: null,
          ...(earlyAdopterUntil !== undefined ? { early_adopter_until: earlyAdopterUntil } : {}),
        },
      };
    }

    it('(a) loads early_adopter_until when the column is present and set', async () => {
      const until = '2027-01-01T00:00:00Z';
      mockSupabaseQuery.mockResolvedValue({ data: makeProfile(until), error: null });

      const { result } = renderHook(() => useExhibitorProfile(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.profile?.person?.early_adopter_until).toBe(until);
      expect(result.current.error).toBeNull();
      expect(result.current.needsOnboarding).toBe(false);
      // Single query — no fallback needed when the column exists.
      expect(mockSupabaseQuery).toHaveBeenCalledTimes(1);
      expect(mockSupabaseQuery.mock.calls[0][2].select).toContain('early_adopter_until');
    });

    it('(b) loads with early_adopter_until null when the column is present but unset', async () => {
      mockSupabaseQuery.mockResolvedValue({ data: makeProfile(null), error: null });

      const { result } = renderHook(() => useExhibitorProfile(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.profile?.person?.early_adopter_until).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.needsOnboarding).toBe(false);
    });

    it('(c) retries without the column on 42703, loads profile, no error, no redirect', async () => {
      // First call (with early_adopter_until) returns the missing-column error;
      // fallback call (without it) succeeds.
      mockSupabaseQuery.mockImplementation(
        (_table: string, _method: string, args: { select?: string }) => {
          if (args.select?.includes('early_adopter_until')) {
            return Promise.resolve({
              data: null,
              error: {
                code: '42703',
                message: 'column people_1.early_adopter_until does not exist',
                details: null,
              },
            });
          }
          return Promise.resolve({ data: makeProfile(null), error: null });
        }
      );

      const { result } = renderHook(() => useExhibitorProfile(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Profile loaded via the fallback select — no thrown error.
      expect(result.current.error).toBeNull();
      expect(result.current.profile?.id).toBe('profile-123');
      expect(result.current.hasProfile).toBe(true);
      // Safe default: no early_adopter_until → not an early adopter.
      expect(result.current.profile?.person?.early_adopter_until).toBeUndefined();
      // The bug: an erroring profile fetch would false-trigger onboarding.
      expect(result.current.needsOnboarding).toBe(false);

      // Exactly two queries: the failing primary + the fallback. No flood.
      expect(mockSupabaseQuery).toHaveBeenCalledTimes(2);
      expect(mockSupabaseQuery.mock.calls[0][2].select).toContain('early_adopter_until');
      expect(mockSupabaseQuery.mock.calls[1][2].select).not.toContain('early_adopter_until');
    });

    it('(c2) still surfaces non-column errors (does not swallow real failures)', async () => {
      mockSupabaseQuery.mockResolvedValue({
        data: null,
        error: { code: '08006', message: 'connection failure', details: null },
      });

      const { result } = renderHook(() => useExhibitorProfile(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      // Only one attempt — a non-column error is not retried.
      expect(mockSupabaseQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('derived state', () => {
    it('should return needsOnboarding=true when user exists but profile does not', async () => {
      mockSupabaseQuery.mockResolvedValue({ data: null, error: null });

      const { result } = renderHook(() => useExhibitorProfile(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.needsOnboarding).toBe(true);
      expect(result.current.hasProfile).toBe(false);
    });

    it('should return hasProfile=true when profile exists', async () => {
      const mockProfile = {
        id: 'profile-123',
        person_id: 'person-456',
        auth_user_id: 'user-123',
        subscription_tier: 'free',
      };

      mockSupabaseQuery.mockResolvedValue({ data: mockProfile, error: null });

      const { result } = renderHook(() => useExhibitorProfile(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasProfile).toBe(true);
      expect(result.current.needsOnboarding).toBe(false);
    });

    it('should return needsOnboarding=false when loading', () => {
      const { result } = renderHook(() => useExhibitorProfile(), {
        wrapper: createWrapper(),
      });

      // While loading
      expect(result.current.needsOnboarding).toBe(false);
    });

    it('should return needsOnboarding as falsy when no user', async () => {
      currentUser = null;

      const { result } = renderHook(() => useExhibitorProfile(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // When user is null, the expression `!isLoading && user && !profile` returns null/falsy
      expect(result.current.needsOnboarding).toBeFalsy();
    });
  });

  describe('hook interface', () => {
    it('should return expected interface shape', async () => {
      const { result } = renderHook(() => useExhibitorProfile(), {
        wrapper: createWrapper(),
      });

      // Check all expected properties exist
      expect(result.current).toHaveProperty('profile');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('refetch');
      expect(result.current).toHaveProperty('needsOnboarding');
      expect(result.current).toHaveProperty('hasProfile');
      expect(result.current).toHaveProperty('createProfile');
      expect(result.current).toHaveProperty('createProfileAsync');
      expect(result.current).toHaveProperty('isCreatingProfile');
      expect(result.current).toHaveProperty('createProfileError');
    });

    it('should have correct types for return values', async () => {
      const { result } = renderHook(() => useExhibitorProfile(), {
        wrapper: createWrapper(),
      });

      expect(typeof result.current.isLoading).toBe('boolean');
      expect(typeof result.current.needsOnboarding).toBe('boolean');
      expect(typeof result.current.hasProfile).toBe('boolean');
      expect(typeof result.current.isCreatingProfile).toBe('boolean');
      expect(typeof result.current.refetch).toBe('function');
      expect(typeof result.current.createProfile).toBe('function');
      expect(typeof result.current.createProfileAsync).toBe('function');
    });
  });

  describe('mutation state', () => {
    it('should start with isCreatingProfile=false', async () => {
      const { result } = renderHook(() => useExhibitorProfile(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isCreatingProfile).toBe(false);
    });

    it('should start with createProfileError=null', async () => {
      const { result } = renderHook(() => useExhibitorProfile(), {
        wrapper: createWrapper(),
      });

      expect(result.current.createProfileError).toBeNull();
    });
  });

  describe('refetch functionality', () => {
    it('should provide a refetch function', async () => {
      const { result } = renderHook(() => useExhibitorProfile(), {
        wrapper: createWrapper(),
      });

      expect(typeof result.current.refetch).toBe('function');
    });
  });

  describe('ExhibitorProfile interface', () => {
    it('should return profile with expected structure', async () => {
      const mockProfile = {
        id: 'profile-123',
        person_id: 'person-456',
        auth_user_id: 'user-123',
        default_handler_id: null,
        subscription_tier: 'premium',
        subscription_expires_at: '2025-01-01',
        stripe_customer_id: 'cus_123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        person: {
          id: 'person-456',
          first_name: 'Jane',
          last_name: 'Smith',
          email: 'jane@example.com',
          phone: '+1234567890',
        },
      };

      mockSupabaseQuery.mockResolvedValue({ data: mockProfile, error: null });

      const { result } = renderHook(() => useExhibitorProfile(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const profile = result.current.profile;
      expect(profile).toBeDefined();
      expect(profile?.id).toBe('profile-123');
      expect(profile?.subscription_tier).toBe('premium');
      expect(profile?.person?.first_name).toBe('Jane');
      expect(profile?.person?.last_name).toBe('Smith');
    });
  });
});
