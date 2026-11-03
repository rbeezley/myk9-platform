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
      'myK9Show was updated. Reload to keep working offline.'
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

  it('Reload calls applyPwaUpdate once and nothing reloads on its own', async () => {
    const { user } = render(<Shell />);
    signal('version-error');
    expect(mocks.applyPwaUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Reload' }));

    expect(mocks.applyPwaUpdate).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });
});
