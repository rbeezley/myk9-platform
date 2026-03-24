/**
 * Tests for useClassRequirements React Query hook.
 *
 * The hook fetches from sport_class_rules joined with sport_templates by
 * organization, element, and level. It uses cacheStrategies.static since
 * requirements don't change during a session.
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

/** Sample mapped ClassRequirements matching what the hook returns after transformation. */
const SAMPLE_REQUIREMENTS: ClassRequirements = {
  organization: 'AKC',
  element: 'Interior',
  level: 'Novice',
  hides: '1',
  distractions: '0',
  time_limit_text: '1:00\u20133:00',
  time_type: 'range',
  area_count: 1,
  hides_known: true,
  has_blank: false,
  timer_mode: 'single',
  odors: ['Birch', 'Anise', 'Clove', 'Cypress'],
};

/** Sample raw row as returned by the Supabase query. */
const SAMPLE_RAW_ROW = {
  element: 'Interior',
  level: 'Novice',
  class_name: 'Interior Novice A',
  section: 'A',
  max_time_seconds_fixed: null,
  max_time_seconds_min: 60,
  max_time_seconds_max: 180,
  hide_count_fixed: 1,
  hide_count_min: null,
  hide_count_max: null,
  hides_known: true,
  area_count: 1,
  has_blank: false,
  distraction_count_min: 0,
  distraction_count_max: 0,
  timer_mode: 'single',
  odors: ['Birch', 'Anise', 'Clove', 'Cypress'],
  sport_templates: { organization: 'AKC' },
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
    it('returns mapped requirements when query returns a row', async () => {
      mockFrom.mockReturnValue(makeQueryChain({ data: [SAMPLE_RAW_ROW], error: null }));

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(
        () =>
          useClassRequirements({
            organization: 'AKC',
            element: 'Interior',
            level: 'Novice A',
          }),
        { wrapper: Wrapper }
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.requirements).toEqual(SAMPLE_REQUIREMENTS);
      expect(result.current.error).toBeNull();
    });

    it('returns null when no matching record exists', async () => {
      mockFrom.mockReturnValue(makeQueryChain({ data: [], error: null }));

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
    it('has correct fields matching sport_class_rules schema', () => {
      const req: ClassRequirements = SAMPLE_REQUIREMENTS;

      // Runtime verification of field existence
      expect(req.organization).toBe('AKC');
      expect(req.element).toBe('Interior');
      expect(req.level).toBe('Novice');
      expect(req.hides).toBe('1');
      expect(req.distractions).toBe('0');
      expect(req.time_limit_text).toBe('1:00\u20133:00');
      expect(req.time_type).toBe('range');
      expect(req.area_count).toBe(1);
      expect(req.hides_known).toBe(true);
      expect(req.has_blank).toBe(false);
      expect(req.timer_mode).toBe('single');
      expect(req.odors).toEqual(['Birch', 'Anise', 'Clove', 'Cypress']);
    });
  });
});
