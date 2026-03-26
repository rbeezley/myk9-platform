import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getEntriesByTrial } from '@/services/database/queries/entry-query-lookups';
import { mockSupabase } from '@/test/mocks/supabase';

// Trackable chain: from → select → eq → is → order
const mockOrder = vi.fn();
const mockIs = vi.fn(() => ({ order: mockOrder }));
const mockEq = vi.fn(() => ({ is: mockIs }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));

beforeEach(() => {
  vi.clearAllMocks();
  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ is: mockIs });
  mockIs.mockReturnValue({ order: mockOrder });
  mockSupabase.from.mockReturnValue({ select: mockSelect });
});

describe('getEntriesByTrial', () => {
  it('queries entries table with inner join on class.trial_id', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });

    await getEntriesByTrial('trial-123');

    expect(mockSupabase.from).toHaveBeenCalledWith('entries');

    // Verify select uses !inner join on class_id
    const selectArg = mockSelect.mock.calls[0][0] as string;
    expect(selectArg).toContain('class:class_id!inner');
    expect(selectArg).toContain('trial_id');

    // Verify filter is on class.trial_id, not entries.trial_id
    expect(mockEq).toHaveBeenCalledWith('class.trial_id', 'trial-123');
  });

  it('excludes soft-deleted entries', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });

    await getEntriesByTrial('trial-123');

    expect(mockIs).toHaveBeenCalledWith('deleted_at', null);
  });

  it('returns data on success', async () => {
    const mockEntries = [{ id: 'entry-1' }, { id: 'entry-2' }];
    mockOrder.mockResolvedValue({ data: mockEntries, error: null });

    const result = await getEntriesByTrial('trial-123');

    expect(result.data).toEqual(mockEntries);
    expect(result.error).toBeNull();
  });

  it('returns empty array and error on failure', async () => {
    mockOrder.mockResolvedValue({
      data: null,
      error: { message: 'DB error', code: '42P01' },
    });

    const result = await getEntriesByTrial('trial-123');

    expect(result.data).toEqual([]);
    expect(result.error).toBeTruthy();
  });
});
