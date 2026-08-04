import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { useRunSystemHealthCheck } from './useSystemHealthSnapshots';

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

describe('useRunSystemHealthCheck', () => {
  it('polls until the manual run token appears in a written snapshot', async () => {
    let readCount = 0;
    mockRpc.mockResolvedValue({ data: { run_token: 'run-123' }, error: null });
    mockFrom.mockImplementation(() => ({
      select: () => ({
        order: () => ({
          limit: async () => {
            readCount += 1;
            return {
              data:
                readCount === 1
                  ? []
                  : [
                      {
                        id: 'snapshot-123',
                        created_at: '2026-08-04T22:00:00.000Z',
                        source: 'cron-health-check:manual:run-123',
                        overall_status: 'fail',
                        checks: [],
                        run_duration_ms: 42,
                      },
                    ],
              error: null,
            };
          },
        }),
      }),
    }));

    const { result } = renderHook(() => useRunSystemHealthCheck(), { wrapper });

    let runResult: Awaited<ReturnType<typeof result.current.mutateAsync>>;
    await act(async () => {
      runResult = await result.current.mutateAsync();
    });

    expect(mockRpc).toHaveBeenCalledWith('run_system_health_check_now');
    expect(readCount).toBe(2);
    expect(runResult!.completed).toBe(true);
    expect(runResult!.data.latest?.source).toBe('cron-health-check:manual:run-123');
  });
});
