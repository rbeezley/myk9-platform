/**
 * The combined Section A/B route reached for `window.alert` in two places — a
 * permission denial on a score tap, and a failed score reset — because
 * `@myk9/ringside` is a shared package and must not depend on the host's toast
 * library. On a phone mid-class that is a blocking native modal stamped with the
 * domain name, and the single-class page already routes both of those exact
 * cases through a toast. Same product, two answers.
 *
 * The fix injects the notifier, so these pin two things: the host's notifier is
 * used when supplied, and the `window.alert` fallback still fires when it is
 * not — because a silently-failed score reset is worse than a bad dialog.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useEntryHandlers } from '../combinedEntryListHelpers';
import type { Entry } from '../../../types';

const noop = async () => {};

function makeOpts(overrides: Partial<Parameters<typeof useEntryHandlers>[0]> = {}) {
  return {
    localEntries: [] as Entry[],
    setLocalEntries: vi.fn(),
    entries: [] as Entry[],
    handleMarkInRing: noop,
    handleMarkCompleted: noop,
    handleStatusChangeHook: noop,
    handleResetScoreHook: vi.fn(async () => {
      throw new Error('rls denied');
    }),
    refresh: noop,
    setActiveTab: vi.fn(),
    ...overrides,
  } as Parameters<typeof useEntryHandlers>[0];
}

const ENTRY = { id: 'entry-1', callName: 'Rex' } as unknown as Entry;

describe('combined entry list — failure notification', () => {
  let alertSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
    vi.useRealTimers();
  });

  it('routes a failed score reset through the injected notifier, not window.alert', async () => {
    const notify = vi.fn();
    const { result } = renderHook(() => useEntryHandlers(makeOpts({ notify })));

    act(() => {
      result.current.handleResetScore(ENTRY);
    });
    await act(async () => {
      await result.current.confirmResetScore();
    });

    await waitFor(() => expect(notify).toHaveBeenCalled());
    expect(notify.mock.calls[0]?.[0]).toMatch(/failed to reset score/i);
    expect(notify.mock.calls[0]?.[1]).toBe('error');
    // The whole point: no blocking native dialog on a judge's phone mid-class.
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('still surfaces the failure when no notifier is injected', async () => {
    // Silence would be worse than the dialog — a judge would believe the score
    // was cleared while it still exists on the server.
    const { result } = renderHook(() => useEntryHandlers(makeOpts()));

    act(() => {
      result.current.handleResetScore(ENTRY);
    });
    await act(async () => {
      await result.current.confirmResetScore();
    });

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
  });
});
