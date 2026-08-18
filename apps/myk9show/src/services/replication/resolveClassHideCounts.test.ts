import { describe, expect, it, vi } from 'vitest';

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

vi.mock('@/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
  },
}));

import { resolveHideCountsForClassRows } from './resolveClassHideCounts';

describe('resolveHideCountsForClassRows', () => {
  it('merges official hide counts by class after resolving each class trial to its show', async () => {
    const mockIn = vi.fn().mockResolvedValue({
      data: [{ id: 'trial-1', show_id: 'show-1' }],
      error: null,
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({ in: mockIn }),
    });
    mockRpc.mockResolvedValue({
      data: [{ class_id: 'class-1', num_hides: 3 }],
      error: null,
    });

    await expect(
      resolveHideCountsForClassRows([{ id: 'class-1', trial_id: 'trial-1' }])
    ).resolves.toEqual(new Map([['class-1', 3]]));

    expect(mockRpc).toHaveBeenCalledWith('get_show_class_hide_counts', {
      p_show_id: 'show-1',
    });
  });
});
