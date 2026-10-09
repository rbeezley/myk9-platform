import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { claimShowOpenRefresh, resetShowOpenRefreshesForTests } from './showOpenRefreshGate';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

describe('claimShowOpenRefresh (MYK9-1064)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T22:00:00Z'));
    resetShowOpenRefreshesForTests();
    onlineManager.setOnline(true);
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    onlineManager.setOnline(true);
    setVisibility('visible');
  });

  it('lets the first open through and coalesces opens inside 15 s', () => {
    expect(claimShowOpenRefresh('show-1')).toBe(true);
    expect(claimShowOpenRefresh('show-1')).toBe(false);
    vi.setSystemTime(new Date('2026-10-08T22:00:14Z'));
    expect(claimShowOpenRefresh('show-1')).toBe(false);
  });

  it('allows another refresh after the gap, and per show', () => {
    expect(claimShowOpenRefresh('show-1')).toBe(true);
    expect(claimShowOpenRefresh('show-2')).toBe(true);
    vi.setSystemTime(new Date('2026-10-08T22:00:16Z'));
    expect(claimShowOpenRefresh('show-1')).toBe(true);
  });

  it('refuses offline without claiming the slot', () => {
    onlineManager.setOnline(false);
    expect(claimShowOpenRefresh('show-1')).toBe(false);
    onlineManager.setOnline(true);
    expect(claimShowOpenRefresh('show-1')).toBe(true);
  });

  it('refreshes a show once per page session while the tab is hidden', () => {
    setVisibility('hidden');
    expect(claimShowOpenRefresh('show-1')).toBe(true);
    vi.setSystemTime(new Date('2026-10-08T22:05:00Z'));
    expect(claimShowOpenRefresh('show-1')).toBe(false);
    setVisibility('visible');
    expect(claimShowOpenRefresh('show-1')).toBe(true);
  });
});
