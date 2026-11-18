import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useClubPayoutsState } from '../useClubPayoutsState';

const accountQuery = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const demoQuery = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock('../useClubStripeAccount', () => ({
  useClubStripeAccount: () => accountQuery.current,
}));
vi.mock('../useClubIsDemo', () => ({
  useClubIsDemo: () => demoQuery.current,
}));

const READY = { onboarding_complete: true, payouts_enabled: true };

function query(data: unknown, extra: Record<string, unknown> = {}) {
  return {
    data,
    isLoading: false,
    isError: false,
    fetchStatus: 'idle',
    refetch: vi.fn(),
    ...extra,
  };
}

describe('useClubPayoutsState', () => {
  beforeEach(() => {
    accountQuery.current = query(READY);
    demoQuery.current = query(false);
  });

  it('reads a fresh payouts-enabled account as ready', () => {
    expect(renderHook(() => useClubPayoutsState('club-1')).result.current.state).toBe('ready');
  });

  it('reads a fresh "no account" answer as not connected', () => {
    accountQuery.current = query(null);
    expect(renderHook(() => useClubPayoutsState('club-1')).result.current.state).toBe(
      'not-connected'
    );
  });

  it('does not trust cached account data after a failed refresh', () => {
    accountQuery.current = query(READY, { isError: true });
    expect(renderHook(() => useClubPayoutsState('club-1')).result.current.state).toBe('unknown');
  });

  it('does not trust cached account data while the read is paused offline', () => {
    accountQuery.current = query(null, { fetchStatus: 'paused' });
    expect(renderHook(() => useClubPayoutsState('club-1')).result.current.state).toBe('unknown');
  });

  it('does not trust a cached demo flag while that read is paused or failed', () => {
    accountQuery.current = query(null);
    demoQuery.current = query(true, { fetchStatus: 'paused' });
    expect(renderHook(() => useClubPayoutsState('club-1')).result.current.state).toBe('unknown');
    demoQuery.current = query(true, { isError: true });
    expect(renderHook(() => useClubPayoutsState('club-1')).result.current.state).toBe('unknown');
  });

  it('is unknown without a club', () => {
    expect(renderHook(() => useClubPayoutsState(undefined)).result.current.state).toBe('unknown');
  });
});
