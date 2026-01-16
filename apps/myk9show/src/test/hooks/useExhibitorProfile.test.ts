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

// Mock Supabase
const mockSupabaseQuery = vi.fn();
const mockSupabaseInsert = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: string) => ({
          maybeSingle: () => mockSupabaseQuery(table, 'maybeSingle', { column, value }),
          single: () => mockSupabaseQuery(table, 'single', { column, value }),
        }),
      }),
      insert: (data: Record<string, unknown>) => ({
        select: () => ({
          single: () => mockSupabaseInsert(table, data),
        }),
      }),
    }),
  },
}));

// Create a wrapper component with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

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
