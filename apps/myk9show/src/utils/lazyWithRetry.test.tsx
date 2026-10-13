import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SuspenseWrapper } from '@/routes/utils/SuspenseWrapper';
import { lazyWithRetry } from './lazyWithRetry';

const CHUNK_ERROR = 'Failed to fetch dynamically imported module: /assets/Page-abc.js';
const Page = () => <div>page loaded</div>;

function renderRoute(Lazy: React.ComponentType) {
  return render(
    <SuspenseWrapper>
      <Lazy />
    </SuspenseWrapper>
  );
}

describe('lazyWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('recovers when the import rejects once with a chunk-load TypeError', async () => {
    const factory = vi
      .fn<() => Promise<{ default: typeof Page }>>()
      .mockRejectedValueOnce(new TypeError(CHUNK_ERROR))
      .mockResolvedValue({ default: Page });
    renderRoute(lazyWithRetry(factory));
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(await screen.findByText('page loaded')).toBeInTheDocument();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('gives up after exactly 3 attempts (1 + 2 retries) and shows the boundary fallback', async () => {
    const factory = vi
      .fn<() => Promise<{ default: typeof Page }>>()
      .mockRejectedValue(new TypeError(CHUNK_ERROR));
    renderRoute(lazyWithRetry(factory));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(await screen.findByText('Failed to load component')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(20000));
    expect(factory).toHaveBeenCalledTimes(3);
  });

  it('Try Again re-attempts the import and renders the page once the network is back', async () => {
    const factory = vi
      .fn<() => Promise<{ default: typeof Page }>>()
      .mockRejectedValue(new TypeError(CHUNK_ERROR));
    renderRoute(lazyWithRetry(factory));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    await screen.findByText('Failed to load component');

    factory.mockResolvedValue({ default: Page });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(screen.getByText('page loaded')).toBeInTheDocument());
    expect(factory).toHaveBeenCalledTimes(4);
  });
});
