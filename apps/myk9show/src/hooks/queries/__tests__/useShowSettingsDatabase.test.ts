/**
 * Tests for useShowSettings and useTrialOverrides query hooks.
 *
 * Mocks Supabase directly via vi.mock and verifies:
 * - Default settings returned when no DB row exists
 * - Correct mapping from DB columns (_timing suffix) to shared type field names
 * - Cache key structure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
import {
  useShowSettings,
  useTrialOverrides,
  settingsQueryKeys,
} from '@/hooks/queries/useShowSettingsDatabase';

// --- Helpers ---

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, Wrapper };
}

/** A chainable Supabase query builder that resolves to `resolved` when awaited. */
function chainableQuery(resolved: Record<string, unknown>) {
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

// --- useShowSettings ---

describe('useShowSettings', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns default standard preset settings when no DB row exists', async () => {
    mockFrom.mockReturnValue(chainableQuery({ data: null, error: null }));

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useShowSettings('show-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBeDefined();
    expect(result.current.data?.hasExplicitSettings).toBe(false);
    expect(result.current.data?.selfCheckinEnabled).toBe(true);

    // Standard preset: placement=class_complete, qualification=immediate, etc.
    const v = result.current.data?.visibility;
    expect(v?.placement).toBe('class_complete');
    expect(v?.qualification).toBe('immediate');
    expect(v?.time).toBe('class_complete');
    expect(v?.faults).toBe('class_complete');
    expect(v?.inheritedFrom).toBe('show');
  });

  it('maps DB _timing columns to shared type short names', async () => {
    const dbRow = {
      show_id: 'show-1',
      preset: 'open',
      placement_timing: 'class_complete',
      qualification_timing: 'immediate',
      time_timing: 'immediate',
      faults_timing: 'immediate',
      self_checkin_enabled: false,
      updated_by: null,
      updated_at: '2026-01-01T00:00:00Z',
    };

    mockFrom.mockReturnValue(chainableQuery({ data: dbRow, error: null }));

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useShowSettings('show-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const v = result.current.data?.visibility;
    expect(v?.placement).toBe('class_complete');
    expect(v?.qualification).toBe('immediate');
    expect(v?.time).toBe('immediate');
    expect(v?.faults).toBe('immediate');
    expect(v?.preset).toBe('open');
    expect(v?.inheritedFrom).toBe('show');
    expect(result.current.data?.selfCheckinEnabled).toBe(false);
    expect(result.current.data?.hasExplicitSettings).toBe(true);
  });

  it('propagates DB errors', async () => {
    const dbError = { message: 'permission denied', code: '42501' };
    mockFrom.mockReturnValue(chainableQuery({ data: null, error: dbError }));

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useShowSettings('show-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('does not fetch when showId is null', () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useShowSettings(null), { wrapper: Wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('uses settingsQueryKeys.show(showId) as query key', async () => {
    mockFrom.mockReturnValue(chainableQuery({ data: null, error: null }));

    const { Wrapper, queryClient } = makeWrapper();
    const { result } = renderHook(() => useShowSettings('show-abc'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const cached = queryClient.getQueryData(settingsQueryKeys.show('show-abc'));
    expect(cached).toBeDefined();
  });
});

// --- useTrialOverrides ---

describe('useTrialOverrides', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when no trials exist for show', async () => {
    // First call: trials query returns empty
    mockFrom.mockReturnValue(chainableQuery({ data: [], error: null }));

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTrialOverrides('show-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([]);
  });

  it('does not fetch when showId is null', () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTrialOverrides(null), { wrapper: Wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('maps override rows to TrialOverrideEntry shape', async () => {
    const trialsData = [{ id: 'trial-1' }];
    const overridesData = [
      {
        trial_id: 'trial-1',
        preset: 'review',
        placement_timing: 'manual_release',
        qualification_timing: 'manual_release',
        time_timing: 'manual_release',
        faults_timing: 'manual_release',
        self_checkin_enabled: false,
        updated_by: null,
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      // First call = trials table, second = trial_visibility_overrides
      const data = callCount === 1 ? trialsData : overridesData;
      return chainableQuery({ data, error: null });
    });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTrialOverrides('show-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toHaveLength(1);
    const entry = result.current.data![0];
    expect(entry.trialId).toBe('trial-1');
    expect(entry.override.preset).toBe('review');
    expect(entry.override.placement).toBe('manual_release');
    expect(entry.selfCheckinEnabled).toBe(false);
  });

  it('returns empty array when no override rows exist', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainableQuery({ data: [{ id: 'trial-1' }], error: null });
      return chainableQuery({ data: null, error: null });
    });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTrialOverrides('show-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([]);
  });
});
