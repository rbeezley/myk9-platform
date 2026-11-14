/**
 * Moves the phone's clocks the way real devices do, for timer tests (MYK9-2007).
 * Use with `vi.useFakeTimers()`.
 */
import { act } from '@testing-library/react';
import { vi } from 'vitest';

export function setPageVisibility(state: 'hidden' | 'visible'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

/** The judge locks the phone: the page hides, the wall clock moves on, the page returns. */
export function sleepPage(ms: number): void {
  setPageVisibility('hidden');
  vi.setSystemTime(Date.now() + ms);
  setPageVisibility('visible');
}

/**
 * The phone corrects its clock by `ms` (negative is back) while the page stays in
 * view and the timers keep ticking. Only the wall clock moves.
 */
export function correctWallClock(ms: number): void {
  vi.setSystemTime(Date.now() + ms);
}
