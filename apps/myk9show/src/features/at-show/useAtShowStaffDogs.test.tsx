import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const getEntriesByShow = vi.hoisted(() => vi.fn());
vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: { getEntriesByShow, subscribe: vi.fn(() => vi.fn()) },
  replicatedArmbandsTable: { getByShow: vi.fn(async () => []), subscribe: vi.fn(() => vi.fn()) },
}));
vi.mock('./useAtShowClassList', () => ({
  useAtShowClassList: () => ({ groups: [], showName: 'Spring', isLoading: false }),
}));

import { useAtShowStaffDogs } from './useAtShowStaffDogs';

describe('useAtShowStaffDogs', () => {
  it('builds the dog list from the replica while the device is offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    getEntriesByShow.mockResolvedValue([
      { id: 'e1', dogId: 'd1', armband: '5', dogCallName: 'Zip', classId: 'c1' },
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAtShowStaffDogs('s1'), { wrapper });
    await waitFor(() => expect(result.current.dogs).toHaveLength(1));
    expect(result.current.dogs[0]?.dogName).toBe('Zip');
    expect(getEntriesByShow).toHaveBeenCalledWith('s1');
  });
});
