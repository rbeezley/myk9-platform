import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RbacOfflineNotice } from './RbacOfflineNotice';

const mockUseAuthContext = vi.fn();

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

describe('RbacOfflineNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
