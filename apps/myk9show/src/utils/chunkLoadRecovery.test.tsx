import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { SuspenseWrapper } from '@/routes/utils/SuspenseWrapper';
import { RELOAD_FALLBACK_MS, lazyWithRetry } from './lazyWithRetry';
import {
  RECOVERY_STORAGE_KEY,
  RELOAD_WINDOW_MS,
  __resetChunkRecoveryForTests,
  canRecoverByReload,
  isChunkLoadError,
  recoverFromChunkLoadError,
} from './chunkLoadRecovery';

const CHUNK_ERROR = new TypeError(
  'Failed to fetch dynamically imported module: http://localhost:4173/assets/scripts/ShowDetailsPage-x.js'
);
const reload = vi.fn();
const setOnline = (online: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);

function setPath(pathname: string) {
  window.history.pushState({}, '', pathname);
}

async function flushRecovery() {
  await act(() => vi.advanceTimersByTimeAsync(2000));
}

describe('chunkLoadRecovery', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    __resetChunkRecoveryForTests();
    window.sessionStorage.clear();
    setPath('/shows');
    setOnline(true);
    reload.mockReset();
    const realLocation = window.location;
    vi.spyOn(window, 'location', 'get').mockReturnValue(
      new Proxy({} as Location, {
        get: (_target, prop) => (prop === 'reload' ? reload : Reflect.get(realLocation, prop)),
      })
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('detects chunk-load errors and nothing else', () => {
    expect(isChunkLoadError(CHUNK_ERROR)).toBe(true);
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false);
  });

  it('reloads once for a chunk error, stamping sessionStorage', async () => {
    expect(recoverFromChunkLoadError(CHUNK_ERROR)).toBe(true);
    await flushRecovery();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(Number(window.sessionStorage.getItem(RECOVERY_STORAGE_KEY))).toBeGreaterThan(0);
  });

  it('does not reload a second time in the same document', async () => {
    recoverFromChunkLoadError(CHUNK_ERROR);
    expect(recoverFromChunkLoadError(CHUNK_ERROR)).toBe(false);
    await flushRecovery();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('never reloads when sessionStorage cannot hold the stamp, so a dead chunk cannot loop', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(recoverFromChunkLoadError(CHUNK_ERROR)).toBe(false);
    await flushRecovery();
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload again right after a recovery reload (new document, same session)', () => {
    window.sessionStorage.setItem(RECOVERY_STORAGE_KEY, String(Date.now()));
    expect(canRecoverByReload(CHUNK_ERROR)).toBe(false);
  });

  it('allows recovery again once the window has passed', () => {
    const now = Date.now();
    window.sessionStorage.setItem(RECOVERY_STORAGE_KEY, String(now - RELOAD_WINDOW_MS - 1));
    expect(canRecoverByReload(CHUNK_ERROR, now)).toBe(true);
  });

  it('never reloads offline', async () => {
    setOnline(false);
    expect(recoverFromChunkLoadError(CHUNK_ERROR)).toBe(false);
    await flushRecovery();
    expect(reload).not.toHaveBeenCalled();
  });

  it.each(['/at-show', '/scoring/abc', '/checkout/1', '/shows/s1/register', '/tv/x'])(
    'never reloads on the sensitive route %s',
    async path => {
      setPath(path);
      expect(recoverFromChunkLoadError(CHUNK_ERROR)).toBe(false);
      await flushRecovery();
      expect(reload).not.toHaveBeenCalled();
    }
  );

  it('ignores errors that are not chunk-load failures', async () => {
    expect(recoverFromChunkLoadError(new Error('boom'))).toBe(false);
    await flushRecovery();
    expect(reload).not.toHaveBeenCalled();
  });

  it('lazyWithRetry reloads instead of showing the boundary when the chunk stays down', async () => {
    const factory = vi.fn().mockRejectedValue(CHUNK_ERROR);
    const Lazy = lazyWithRetry(factory);
    render(
      <SuspenseWrapper>
        <Lazy />
      </SuspenseWrapper>
    );
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Failed to load component')).not.toBeInTheDocument();
  });

  it('lazyWithRetry falls back to the boundary when the started reload never happens', async () => {
    const factory = vi.fn().mockRejectedValue(CHUNK_ERROR);
    const Lazy = lazyWithRetry(factory);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <SuspenseWrapper>
        <Lazy />
      </SuspenseWrapper>
    );
    // Retries (300 + 1000ms), then the reload starts; the mocked reload never navigates.
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Failed to load component')).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(RELOAD_FALLBACK_MS + 100));
    expect(await screen.findByText('Failed to load component')).toBeInTheDocument();
  });

  it('lazyWithRetry still shows the boundary on a sensitive route', async () => {
    setPath('/at-show');
    const factory = vi.fn().mockRejectedValue(CHUNK_ERROR);
    const Lazy = lazyWithRetry(factory);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <SuspenseWrapper>
        <Lazy />
      </SuspenseWrapper>
    );
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(await screen.findByText('Failed to load component')).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });
});
