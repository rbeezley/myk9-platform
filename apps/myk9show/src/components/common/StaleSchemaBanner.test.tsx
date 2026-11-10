import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen } from '@testing-library/react';
import { Link, Route, Routes } from 'react-router-dom';
import { render } from '@/test/utils/testUtils';
import { StaleSchemaBanner } from './StaleSchemaBanner';

const mocks = vi.hoisted(() => ({
  latch: null as string | null,
  listeners: new Set<(reason: string) => void>(),
  applyPwaUpdate: vi.fn(),
}));

vi.mock('@myk9/replication', async importOriginal => ({
  ...(await importOriginal<typeof import('@myk9/replication')>()),
  getStaleSchemaLatch: () => mocks.latch,
  onStaleSchema: (listener: (reason: string) => void) => {
    mocks.listeners.add(listener);
    return () => mocks.listeners.delete(listener);
  },
}));

vi.mock('@/services/pwa/pwaUpdate', () => ({
  applyPwaUpdate: mocks.applyPwaUpdate,
}));

function signal(reason: string) {
  mocks.latch = reason;
  act(() => {
    mocks.listeners.forEach(listener => listener(reason));
  });
}

function Shell() {
  return (
    <>
      <StaleSchemaBanner />
      <Link to="/next">go</Link>
      <Routes>
        <Route path="/" element={<div>home</div>} />
        <Route path="/next" element={<div>next</div>} />
      </Routes>
    </>
  );
}

describe('StaleSchemaBanner', () => {
  const reload = vi.fn();
  const realLocation = window.location;

  beforeEach(() => {
    mocks.latch = null;
    mocks.listeners.clear();
    mocks.applyPwaUpdate.mockReset();
    reload.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...realLocation, reload },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  });

  it('renders nothing before the stale signal', () => {
    render(<Shell />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('appears after the signal and survives a route change', async () => {
    const { user } = render(<Shell />);
    signal('version-change');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'myK9Show was updated. Update the app to keep working offline.'
    );
    await user.click(screen.getByText('go'));
    expect(screen.getByText('next')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows when the latch was set before it mounted', () => {
    mocks.latch = 'version-error';
    render(<Shell />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('Reload calls applyPwaUpdate once, nothing reloads on its own, then falls back to a reload', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.applyPwaUpdate.mockResolvedValue(undefined);
    const { user } = render(<Shell />);
    signal('version-error');
    expect(mocks.applyPwaUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Update the app' }));

    expect(mocks.applyPwaUpdate).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(reload).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('offline: disables Reload, never reloads, and re-enables when back online', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { user } = render(<Shell />);
    signal('version-change');

    expect(screen.getByText('Connect to the internet, then update the app.')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Update the app' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(mocks.applyPwaUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    onLine.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByRole('button', { name: 'Update the app' })).toBeEnabled();
    onLine.mockRestore();
  });

  it('clears the fixed header via the shared top-offset variables (class check; jsdom has no layout)', () => {
    mocks.latch = 'version-error';
    render(<Shell />);
    const cls = screen.getByRole('alert').className;
    expect(cls).toContain('var(--pwa-banner-height,0px)+var(--app-header-height,3rem)');
    expect(cls).toContain('sticky');
  });
});
