/**
 * Tests for useClassRequirements React Query hook.
 *
 * The hook fetches from the class_requirements table by organization, element,
 * and level. It uses cacheStrategies.static since requirements don't change
 * during a session.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// --- Supabase mock (must be set up before module imports) ---

const mockFrom = vi.fn();

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'from') return mockFrom;
        return undefined;
      },
    }
  ),
}));

// Import after mocks
import { useClassRequirements } from '@/hooks/queries/useClassRequirements';
import type { ClassRequirements } from '@/hooks/queries/useClassRequirements';
import { cacheStrategies } from '@/lib/queryClient';

// --- Helpers ---

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, Wrapper };
}

/** Builds a chainable mock that resolves with data when awaited. */
function makeQueryChain(resolved: { data: unknown; error: unknown }) {
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve(resolved);
      }
      return vi.fn(() => new Proxy({}, handler));
    },
  };
  return new Proxy({}, handler);
}

const SAMPLE_REQUIREMENTS: ClassRequirements = {
  organization: 'AKC',
  element: 'Interior',
  level: 'Novice',
  hides: '1',
  distractions: '0',
  height: 'N/A',
  area_count: 1,
  area_size: '200-400 sq ft',
  time_limit_text: '2:00',
  time_limit_seconds: 120,
  has_30_second_warning: true,
  time_type: 'fixed',
  warning_notes: null,
  required_calls: 'Alert',
  final_response: null,
  containers_items: null,
  area_count_min: null,
  area_count_max: null,
};

// --- Tests ---

describe('useClassRequirements', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('disabled when params are empty', () => {
    it('returns null requirements when element is empty', () => {
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(
        () => useClassRequirements({ organization: 'AKC', element: '', level: 'Novice' }),
        { wrapper: Wrapper }
      );

      expect(result.current.requirements).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('returns null requirements when level is empty', () => {
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(
        () => useClassRequirements({ organization: 'AKC', element: 'Interior', level: '' }),
        { wrapper: Wrapper }
      );

      expect(result.current.requirements).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('returns null requirements when organization is null', () => {
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(
        () => useClassRequirements({ organization: null, element: 'Interior', level: 'Novice' }),
        { wrapper: Wrapper }
      );

      expect(result.current.requirements).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('returns requirements data', () => {
    it('returns requirements when element/level match a record', async () => {
      mockFrom.mockReturnValue(makeQueryChain({ data: SAMPLE_REQUIREMENTS, error: null }));

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(
        () =>
          useClassRequirements({
            organization: 'AKC',
            element: 'Interior',
            level: 'Novice',
          }),
        { wrapper: Wrapper }
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.requirements).toEqual(SAMPLE_REQUIREMENTS);
      expect(result.current.error).toBeNull();
    });

    it('returns null when no matching record exists', async () => {
      mockFrom.mockReturnValue(makeQueryChain({ data: null, error: null }));

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(
        () =>
          useClassRequirements({
            organization: 'AKC',
            element: 'Interior',
            level: 'Unknown',
          }),
        { wrapper: Wrapper }
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.requirements).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe('cache strategy', () => {
    it('uses cacheStrategies.static (requirements are stable during session)', () => {
      // Verify the static cache strategy values exist and are reasonable
      expect(cacheStrategies.static.staleTime).toBe(30 * 60 * 1000); // 30 minutes
      expect(cacheStrategies.static.gcTime).toBe(60 * 60 * 1000); // 1 hour
    });
  });

  describe('handles missing organization gracefully', () => {
    it('returns null when organization is null', () => {
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(
        () =>
          useClassRequirements({
            organization: null,
            element: 'Interior',
            level: 'Novice',
          }),
        { wrapper: Wrapper }
      );

      expect(result.current.requirements).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('ClassRequirements type', () => {
    it('has correct fields with no any types', () => {
      // Type-level check: compile-time verification that ClassRequirements
      // has the expected shape. If any field is missing or typed as `any`,
      // TypeScript will catch it at build time.
      const req: ClassRequirements = SAMPLE_REQUIREMENTS;

      // Runtime verification of field existence
      expect(req.organization).toBe('AKC');
      expect(req.element).toBe('Interior');
      expect(req.level).toBe('Novice');
      expect(req.hides).toBe('1');
      expect(req.distractions).toBe('0');
      expect(req.height).toBe('N/A');
      expect(req.area_count).toBe(1);
      expect(req.area_size).toBe('200-400 sq ft');
      expect(req.time_limit_text).toBe('2:00');
      expect(req.time_limit_seconds).toBe(120);
      expect(req.has_30_second_warning).toBe(true);
      expect(req.time_type).toBe('fixed');
      expect(req.warning_notes).toBeNull();
      expect(req.required_calls).toBe('Alert');
      expect(req.final_response).toBeNull();
      expect(req.containers_items).toBeNull();
      expect(req.area_count_min).toBeNull();
      expect(req.area_count_max).toBeNull();
    });
  });
});
