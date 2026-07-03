import { describe, expect, it } from 'vitest';
import { isBenignResizeObserverLoopError } from './ignoredBrowserErrors';

describe('isBenignResizeObserverLoopError', () => {
  it('matches browser ResizeObserver loop notifications', () => {
    expect(isBenignResizeObserverLoopError('ResizeObserver loop limit exceeded')).toBe(true);
    expect(
      isBenignResizeObserverLoopError(
        'ResizeObserver loop completed with undelivered notifications.'
      )
    ).toBe(true);
  });

  it('does not match unrelated JavaScript errors', () => {
    expect(isBenignResizeObserverLoopError('TypeError: Cannot read properties of undefined')).toBe(
      false
    );
    expect(isBenignResizeObserverLoopError(undefined)).toBe(false);
  });
});
