/**
 * Tests for RingsideContext + the typed sub-hooks + derived hooks.
 *
 * Behavior contracts under test:
 *   1. `useRingside()` outside a provider throws (not silently undefined).
 *   2. `useRingside()` inside a provider returns the exact value passed.
 *   3. Typed sub-hooks read their slice.
 *   4. `useRingsidePermission()` correctly derives role/permission helpers
 *      from the auth slice — mirrors apps/myk9q's `usePermission` surface.
 *   5. `useShowOrg()` micro-consumer reads `auth.showContext?.org`.
 *   6. Replication + prefetch invocations forward to the host functions
 *      (call-through verification, not real I/O).
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

import {
  RingsideProvider,
  useRingside,
  useRingsideAuth,
  useRingsideReplication,
  useRingsidePrefetch,
} from './RingsideContext';
import { useRingsidePermission } from './useRingsidePermission';
import { useShowOrg } from './useShowOrg';
import type {
  RingsideContextValue,
  RingsideShowContext,
} from './types';
import type { UserPermissions } from '../auth/passcodes';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeShowContext(overrides: Partial<RingsideShowContext> = {}): RingsideShowContext {
  return {
    showId: 'show-1',
    showName: 'Test Show',
    clubName: 'Test Club',
    showDate: '2026-06-01',
    licenseKey: 'myK9Q1-test',
    org: 'AKC Scent Work',
    competition_type: 'Regular',
    ...overrides,
  };
}

function makeContextValue(
  overrides: Partial<RingsideContextValue> = {},
  authOverrides: Partial<RingsideContextValue['auth']> = {}
): RingsideContextValue {
  return {
    auth: {
      role: 'admin',
      showContext: makeShowContext(),
      canAccess: () => true,
      ...authOverrides,
    },
    replication: {
      updateClassStatus: vi.fn().mockResolvedValue(undefined),
    },
    prefetch: {
      get: vi.fn().mockResolvedValue(null),
    },
    ...overrides,
  };
}

function wrap(value: RingsideContextValue) {
  return ({ children }: { children: ReactNode }) => (
    <RingsideProvider value={value}>{children}</RingsideProvider>
  );
}

// ── 1. Outside-provider behavior ─────────────────────────────────────────

describe('useRingside (outside provider)', () => {
  it('throws a diagnostic error rather than returning undefined', () => {
    // Suppress the React error boundary console noise — the throw is intentional.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => useRingside())).toThrow(
      /useRingside must be used within a <RingsideProvider>/
    );

    consoleError.mockRestore();
  });
});

// ── 2. Inside-provider behavior ──────────────────────────────────────────

describe('useRingside (inside provider)', () => {
  it('returns the exact value the host passed', () => {
    const value = makeContextValue();
    const { result } = renderHook(() => useRingside(), { wrapper: wrap(value) });

    expect(result.current).toBe(value);
    expect(result.current.auth.role).toBe('admin');
    expect(result.current.auth.showContext?.org).toBe('AKC Scent Work');
  });
});

// ── 3. Typed sub-hooks ───────────────────────────────────────────────────

describe('typed sub-hooks', () => {
  it('useRingsideAuth returns the auth slice', () => {
    const value = makeContextValue();
    const { result } = renderHook(() => useRingsideAuth(), { wrapper: wrap(value) });

    expect(result.current).toBe(value.auth);
  });

  it('useRingsideReplication returns the replication slice', () => {
    const value = makeContextValue();
    const { result } = renderHook(() => useRingsideReplication(), { wrapper: wrap(value) });

    expect(result.current).toBe(value.replication);
  });

  it('useRingsidePrefetch returns the prefetch slice', () => {
    const value = makeContextValue();
    const { result } = renderHook(() => useRingsidePrefetch(), { wrapper: wrap(value) });

    expect(result.current).toBe(value.prefetch);
  });
});

// ── 4. Derived permission hook ───────────────────────────────────────────

describe('useRingsidePermission', () => {
  it('hasPermission delegates to auth.canAccess', () => {
    const canAccess = vi.fn((perm: keyof UserPermissions) => perm === 'canScore');
    const value = makeContextValue({}, { canAccess });

    const { result } = renderHook(() => useRingsidePermission(), { wrapper: wrap(value) });

    expect(result.current.hasPermission('canScore')).toBe(true);
    expect(result.current.hasPermission('canManageClasses')).toBe(false);
    expect(canAccess).toHaveBeenCalledWith('canScore');
    expect(canAccess).toHaveBeenCalledWith('canManageClasses');
  });

  it('hasRole accepts both single role and role array', () => {
    const value = makeContextValue({}, { role: 'judge' });

    const { result } = renderHook(() => useRingsidePermission(), { wrapper: wrap(value) });

    expect(result.current.hasRole('judge')).toBe(true);
    expect(result.current.hasRole('admin')).toBe(false);
    expect(result.current.hasRole(['judge', 'admin'])).toBe(true);
    expect(result.current.hasRole(['steward', 'exhibitor'])).toBe(false);
  });

  it('hasRole returns false when role is null', () => {
    const value = makeContextValue({}, { role: null });

    const { result } = renderHook(() => useRingsidePermission(), { wrapper: wrap(value) });

    expect(result.current.hasRole('admin')).toBe(false);
    expect(result.current.hasRole(['admin', 'judge'])).toBe(false);
  });

  it.each([
    ['admin', 'isAdmin'],
    ['judge', 'isJudge'],
    ['steward', 'isSteward'],
    ['exhibitor', 'isExhibitor'],
  ] as const)('role-predicate %s flips %s on', (role, predicate) => {
    const value = makeContextValue({}, { role });
    const { result } = renderHook(() => useRingsidePermission(), { wrapper: wrap(value) });

    expect(result.current[predicate]()).toBe(true);
  });

  it('exposes currentRole verbatim', () => {
    const value = makeContextValue({}, { role: 'steward' });
    const { result } = renderHook(() => useRingsidePermission(), { wrapper: wrap(value) });

    expect(result.current.currentRole).toBe('steward');
  });
});

// ── 5. Micro-consumer: useShowOrg ────────────────────────────────────────

describe('useShowOrg (micro-consumer, proves end-to-end wiring)', () => {
  it('returns the org name when a show is in context', () => {
    const value = makeContextValue({}, {
      showContext: makeShowContext({ org: 'UKC Nosework' }),
    });
    const { result } = renderHook(() => useShowOrg(), { wrapper: wrap(value) });

    expect(result.current).toBe('UKC Nosework');
  });

  it('returns undefined when showContext is null (pre-login)', () => {
    const value = makeContextValue({}, { showContext: null });
    const { result } = renderHook(() => useShowOrg(), { wrapper: wrap(value) });

    expect(result.current).toBeUndefined();
  });
});

// ── 6. Replication/prefetch forwarding ───────────────────────────────────

describe('replication + prefetch forwarding', () => {
  it('updateClassStatus invocation forwards to the host function with the exact args', async () => {
    const updateClassStatus = vi.fn().mockResolvedValue(undefined);
    const value = makeContextValue({
      replication: { updateClassStatus },
    });

    const { result } = renderHook(() => useRingsideReplication(), { wrapper: wrap(value) });

    await result.current.updateClassStatus('class-42', 'briefing', {
      briefing_time: '10:30 AM',
    });

    expect(updateClassStatus).toHaveBeenCalledExactlyOnceWith('class-42', 'briefing', {
      briefing_time: '10:30 AM',
    });
  });

  it('prefetch.get invocation forwards to the host function', async () => {
    const get = vi.fn().mockResolvedValue({ trial_name: 'Trial 1' });
    const value = makeContextValue({
      prefetch: { get },
    });

    const { result } = renderHook(() => useRingsidePrefetch(), { wrapper: wrap(value) });

    const data = await result.current.get('trial-info-key');

    expect(get).toHaveBeenCalledExactlyOnceWith('trial-info-key');
    expect(data).toEqual({ trial_name: 'Trial 1' });
  });
});
