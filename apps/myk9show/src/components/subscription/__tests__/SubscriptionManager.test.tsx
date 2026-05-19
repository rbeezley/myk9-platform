import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionManager } from '../SubscriptionManager';

const maybeSingleMock = vi.hoisted(() => vi.fn());
const eqMock = vi.hoisted(() => vi.fn(() => ({ maybeSingle: maybeSingleMock })));
const selectMock = vi.hoisted(() => vi.fn(() => ({ eq: eqMock })));
const fromMock = vi.hoisted(() => vi.fn(() => ({ select: selectMock })));
const loggerErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'free-user-1' },
    loading: false,
  }),
}));

vi.mock('@/context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: fromMock,
  },
}));

vi.mock('@/services/LoggingService', () => ({
  logger: {
    error: loggerErrorMock,
  },
}));

describe('SubscriptionManager', () => {
  beforeEach(() => {
    fromMock.mockClear();
    selectMock.mockClear();
    eqMock.mockClear();
    maybeSingleMock.mockReset();
    loggerErrorMock.mockClear();
  });

  it('renders the free-account empty state when no subscription row exists', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    render(<SubscriptionManager />);

    expect(await screen.findByText('No active subscription')).toBeInTheDocument();
    expect(screen.getByText('No billing history available')).toBeInTheDocument();

    await waitFor(() => {
      expect(maybeSingleMock).toHaveBeenCalled();
    });
    expect(fromMock).toHaveBeenCalledWith('stripe_subscriptions');
    expect(eqMock).toHaveBeenCalledWith('customer_id', 'free-user-1');
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });
});
