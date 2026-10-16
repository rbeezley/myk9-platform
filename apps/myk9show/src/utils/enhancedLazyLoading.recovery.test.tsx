import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SuspenseWrapper } from '@/routes/utils/SuspenseWrapper';
import { createEnhancedLazy, RouteLazyPresets } from './enhancedLazyLoading';

const CHUNK_ERROR = 'Failed to fetch dynamically imported module: /assets/AtShow-abc.js';
const Page = () => <div>at-show page loaded</div>;

describe('createEnhancedLazy recovery (at-show style route)', () => {
  beforeEach(() => {
    // Offline: chunkLoadRecovery must not auto-reload, so the boundary stays under test.
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('Try Again re-imports after every retry failed, and keeps preload/options/displayName', async () => {
    const importFn = vi
      .fn<() => Promise<{ default: typeof Page }>>()
      .mockRejectedValue(new TypeError(CHUNK_ERROR));
    const Lazy = createEnhancedLazy(importFn, {
      ...RouteLazyPresets.mediumPriority,
      displayName: 'AtShowEntryListPage',
    });
    expect(typeof Lazy.preload).toBe('function');
    expect(Lazy.displayName).toBe('AtShowEntryListPage');
    expect(Lazy.options.retryAttempts).toBe(2);

    render(
      <SuspenseWrapper>
        <Lazy />
      </SuspenseWrapper>
    );
    // backoff 2s + 4s, then the terminal failure
    await act(() => vi.advanceTimersByTimeAsync(10000));
    await screen.findByText('Failed to load component');
    expect(importFn).toHaveBeenCalledTimes(3);

    importFn.mockResolvedValue({ default: Page });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(screen.getByText('at-show page loaded')).toBeInTheDocument());
    expect(importFn).toHaveBeenCalledTimes(4);
  });
});
