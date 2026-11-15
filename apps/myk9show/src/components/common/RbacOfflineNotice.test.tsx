import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RbacOfflineNotice } from './RbacOfflineNotice';

const mockUseAuthContext = vi.fn();
const toastDismiss = vi.hoisted(() => vi.fn());
let mockOnline = true;

vi.mock('sonner', () => ({ toast: { dismiss: toastDismiss } }));
vi.mock('@/lib/networkUtils', () => ({ useOnlineStatus: () => mockOnline }));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

describe('RbacOfflineNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnline = true;
  });

  it('renders nothing when permissions are live', () => {
    mockUseAuthContext.mockReturnValue({ rbacFromCacheAt: null });

    const { container } = render(<RbacOfflineNotice />);

    expect(container).toBeEmptyDOMElement();
  });

  it('states permissions are cached and shows their age when hydrated from cache', () => {
    mockUseAuthContext.mockReturnValue({ rbacFromCacheAt: '2026-08-15T18:30:00.000Z' });

    render(<RbacOfflineNotice />);

    expect(screen.getByText(/working offline/i)).toBeInTheDocument();
    expect(screen.getByText(/permissions as of/i)).toBeInTheDocument();
    // The cached timestamp must appear in a human-readable form.
    expect(screen.getByText(/Aug(ust)? 15/)).toBeInTheDocument();
  });

  it('is the only offline message: it carries the saved-on-device sentence and drops the toast', async () => {
    vi.useFakeTimers();
    try {
      mockOnline = false;
      mockUseAuthContext.mockReturnValue({ rbacFromCacheAt: '2026-08-15T18:30:00.000Z' });

      render(<RbacOfflineNotice />);
      await act(async () => {
        vi.runAllTimers();
      });

      expect(screen.getByText(/changes are saved on this device/i)).toBeInTheDocument();
      expect(toastDismiss).toHaveBeenCalledWith('network-offline');
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves the offline toast alone while the device is online', () => {
    mockUseAuthContext.mockReturnValue({ rbacFromCacheAt: '2026-08-15T18:30:00.000Z' });

    render(<RbacOfflineNotice />);

    expect(screen.queryByText(/changes are saved on this device/i)).not.toBeInTheDocument();
    expect(toastDismiss).not.toHaveBeenCalled();
  });
});
