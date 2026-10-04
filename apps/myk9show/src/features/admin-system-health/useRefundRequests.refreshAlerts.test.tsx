import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const invoke = vi.fn();
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

import { OPERATOR_ALERTS_QUERY_KEY } from './useOperatorAlerts';
import { REFUND_REQUESTS_QUERY_KEY, useResolveRefundRequest } from './useRefundRequests';

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(OPERATOR_ALERTS_QUERY_KEY, [{ id: 'alert-1' }]);
  queryClient.setQueryData(REFUND_REQUESTS_QUERY_KEY, [{ id: 'request-1' }]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useResolveRefundRequest(), { wrapper });
  return { queryClient, result };
}

// MYK9-981: resolving a request closes its alert server-side (closure trigger),
// so the alert list must refresh at once, as Approve already does.
describe('useResolveRefundRequest', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('refreshes the operator alerts as well as the refund requests after a resolution', async () => {
    invoke.mockResolvedValue({ data: { outcome: 'resolved' }, error: null });
    const { queryClient, result } = setup();

    await result.current.mutateAsync({ requestId: 'request-1', note: 'Paid back in cash' });

    expect(queryClient.getQueryState(OPERATOR_ALERTS_QUERY_KEY)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(REFUND_REQUESTS_QUERY_KEY)?.isInvalidated).toBe(true);
  });

  it('does not fabricate a resolution when the function refuses', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { context: { json: async () => ({ code: 'request_not_pending' }) } },
    });
    const { queryClient, result } = setup();

    await expect(
      result.current.mutateAsync({ requestId: 'request-1', note: 'Paid back in cash' })
    ).rejects.toThrow();

    expect(queryClient.getQueryData(OPERATOR_ALERTS_QUERY_KEY)).toEqual([{ id: 'alert-1' }]);
  });
});
