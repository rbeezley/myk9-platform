/**
 * Tests for useSelfCheckinEnabled hook.
 *
 * The hook reads from four separate Supabase table queries:
 *  1. classes (to get trial_id and show_id)
 *  2-4. Parallel: show_visibility_settings, trial_visibility_overrides, class_visibility_overrides
 *
 * Verifies the full cascade: class ?? trial ?? show ?? true
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
import { useSelfCheckinEnabled } from '@/hooks/queries/useSelfCheckinEnabled';

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

/**
 * Set up `mockFrom` using table name routing to handle the fact that
 * the three visibility queries run in parallel (Promise.all).
 *
 * Route by table name:
 *  - 'classes'                    → classRow
 *  - 'show_visibility_settings'   → show checkin value
 *  - 'trial_visibility_overrides' → trial checkin value
 *  - 'class_visibility_overrides' → class checkin value
 */
function setupMockFrom(opts: {
  classRow: { trial_id: string; trials: { show_id: string } } | null;
  showCheckin: boolean | null;
  trialCheckin: boolean | null;
  classCheckin: boolean | null;
}) {
  mockFrom.mockImplementation((tableName: string) => {
    switch (tableName) {
      case 'classes':
        return makeQueryChain({
          data: opts.classRow,
          error: opts.classRow ? null : { message: 'not found' },
        });
      case 'show_visibility_settings':
        return makeQueryChain({
          data: opts.showCheckin !== null ? { self_checkin_enabled: opts.showCheckin } : null,
          error: null,
        });
      case 'trial_visibility_overrides':
        return makeQueryChain({
          data: opts.trialCheckin !== null ? { self_checkin_enabled: opts.trialCheckin } : null,
          error: null,
        });
      case 'class_visibility_overrides':
        return makeQueryChain({
          data: opts.classCheckin !== null ? { self_checkin_enabled: opts.classCheckin } : null,
          error: null,
        });
      default:
        return makeQueryChain({ data: null, error: null });
    }
  });
}

const CLASS_ROW = { trial_id: 'trial-1', trials: { show_id: 'show-1' } };

// --- Tests ---

describe('useSelfCheckinEnabled', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('null classId', () => {
    it('does not fetch and defaults to enabled=true', () => {
      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useSelfCheckinEnabled(null), { wrapper: Wrapper });

      expect(result.current.enabled).toBe(true);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.reason).toBeUndefined();
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('default (no rows)', () => {
    it('returns enabled=true when all three visibility tables have no row', async () => {
      setupMockFrom({
        classRow: CLASS_ROW,
        showCheckin: null,
        trialCheckin: null,
        classCheckin: null,
      });

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useSelfCheckinEnabled('class-1'), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.enabled).toBe(true);
      expect(result.current.reason).toBeUndefined();
    });
  });

  describe('show-level disabled', () => {
    it('returns enabled=false when show disables and no overrides', async () => {
      setupMockFrom({
        classRow: CLASS_ROW,
        showCheckin: false,
        trialCheckin: null,
        classCheckin: null,
      });

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useSelfCheckinEnabled('class-1'), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.enabled).toBe(false);
      expect(result.current.reason).toBe('Check-in disabled by show management');
    });
  });

  describe('trial overrides show', () => {
    it('trial enabled=true overrides show disabled', async () => {
      setupMockFrom({
        classRow: CLASS_ROW,
        showCheckin: false,
        trialCheckin: true,
        classCheckin: null,
      });

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useSelfCheckinEnabled('class-1'), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.enabled).toBe(true);
    });

    it('trial disabled=false overrides show enabled', async () => {
      setupMockFrom({
        classRow: CLASS_ROW,
        showCheckin: true,
        trialCheckin: false,
        classCheckin: null,
      });

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useSelfCheckinEnabled('class-1'), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.enabled).toBe(false);
    });
  });

  describe('class overrides trial', () => {
    it('class enabled=true overrides trial disabled', async () => {
      setupMockFrom({
        classRow: CLASS_ROW,
        showCheckin: false,
        trialCheckin: false,
        classCheckin: true,
      });

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useSelfCheckinEnabled('class-1'), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.enabled).toBe(true);
    });

    it('class disabled=false overrides trial enabled', async () => {
      setupMockFrom({
        classRow: CLASS_ROW,
        showCheckin: true,
        trialCheckin: true,
        classCheckin: false,
      });

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useSelfCheckinEnabled('class-1'), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.enabled).toBe(false);
    });
  });

  describe('null at class/trial falls through to show', () => {
    it('null class, null trial, show=false → disabled', async () => {
      setupMockFrom({
        classRow: CLASS_ROW,
        showCheckin: false,
        trialCheckin: null,
        classCheckin: null,
      });

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useSelfCheckinEnabled('class-1'), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.enabled).toBe(false);
    });

    it('null class, trial=false, show=true → disabled (trial wins)', async () => {
      setupMockFrom({
        classRow: CLASS_ROW,
        showCheckin: true,
        trialCheckin: false,
        classCheckin: null,
      });

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useSelfCheckinEnabled('class-1'), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.enabled).toBe(false);
    });
  });

  describe('safe default on class lookup failure', () => {
    it('returns enabled=true when class row cannot be fetched', async () => {
      mockFrom.mockReturnValue(makeQueryChain({ data: null, error: { message: 'not found' } }));

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useSelfCheckinEnabled('class-1'), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.enabled).toBe(true);
    });
  });
});
