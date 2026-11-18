// Raw render on purpose: RootRouter owns its routers, and the shared test render wraps its
// subject in one, which React Router refuses to nest.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Link } from 'react-router-dom';
import { RootRouter } from './RootRouter';

const recovery = vi.hoisted(() => ({ recoverFromChunkLoadError: vi.fn(() => false) }));
vi.mock('@/utils/chunkLoadRecovery', () => recovery);

const logging = vi.hoisted(() => ({ logger: { error: vi.fn() } }));
vi.mock('@/services/LoggingService', () => logging);

vi.mock('@/pages/Home', () => ({
  default: () => (
    <main>
      <p>light landing page</p>
      <Link to="/sign-in">Sign in</Link>
    </main>
  ),
}));

// The app file cannot be fetched: every import of it fails.
vi.mock('../router', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

/** Long enough for the idle wait and every retry of one load attempt. */
const ONE_ATTEMPT_MS = 5_000;

describe('RootRouter when the app file cannot be fetched', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    recovery.recoverFromChunkLoadError.mockClear();
    logging.logger.error.mockClear();
    window.history.replaceState({}, '', '/');
  });

  it('leaves a guest on the landing page alone: no reload, no error', async () => {
    render(<RootRouter guestBoot onRouter={vi.fn()} />);
    await act(() => vi.advanceTimersByTimeAsync(ONE_ATTEMPT_MS));

    expect(screen.getByText('light landing page')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(recovery.recoverFromChunkLoadError).not.toHaveBeenCalled();
    expect(logging.logger.error).not.toHaveBeenCalled();
  });

  it('tries again when the guest leaves the landing page, and only then reports', async () => {
    render(<RootRouter guestBoot onRouter={vi.fn()} />);
    await act(() => vi.advanceTimersByTimeAsync(ONE_ATTEMPT_MS));

    fireEvent.click(screen.getByRole('link', { name: 'Sign in' }));
    await act(() => vi.advanceTimersByTimeAsync(ONE_ATTEMPT_MS));

    expect(recovery.recoverFromChunkLoadError).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('myK9Show could not finish loading');
  });

  it('reports to a visitor whose page is the app itself', async () => {
    // A sign-in return: the query and fragment carry tokens and must never reach the log.
    window.history.replaceState({}, '', '/auth/callback?code=secret-code#access_token=secret');
    render(<RootRouter guestBoot={false} onRouter={vi.fn()} />);
    await act(() => vi.advanceTimersByTimeAsync(ONE_ATTEMPT_MS));

    expect(logging.logger.error).toHaveBeenCalledWith(
      'The app file failed to load',
      'boot',
      { data: { path: '/auth/callback', failure: expect.any(String) } },
      expect.any(Error)
    );
    expect(JSON.stringify(logging.logger.error.mock.calls)).not.toContain('secret');
    expect(recovery.recoverFromChunkLoadError).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('myK9Show could not finish loading');
  });
});
