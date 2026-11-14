import { describe, it, expect, vi, beforeEach } from 'vitest';

const chain = vi.hoisted(() => {
  const inFn = vi.fn();
  const select = vi.fn(() => ({ in: inFn }));
  const from = vi.fn(() => ({ select }));
  return { inFn, select, from };
});

vi.mock('@/lib/supabase', () => ({ supabase: { from: chain.from } }));

import { fetchEntryRowsByClass } from './notificationSnapshotSources';

describe('fetchEntryRowsByClass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chain.inFn.mockResolvedValue({ data: [{ id: 'e1' }], error: null });
  });

  it('selects the run-queue columns from the authenticated results view, filtered by class', async () => {
    const rows = await fetchEntryRowsByClass(['c1', 'c2']);

    expect(chain.from).toHaveBeenCalledWith('view_authenticated_entry_results');
    const columns = (chain.select.mock.calls[0] as unknown as [string])[0]
      .split(',')
      .map(column => column.trim());
    expect(columns).toEqual(
      expect.arrayContaining(['run_order', 'entry_status', 'is_in_ring', 'deleted_at'])
    );
    expect(chain.inFn).toHaveBeenCalledWith('class_id', ['c1', 'c2']);
    expect(rows).toEqual([{ id: 'e1' }]);
  });

  it('throws the query error', async () => {
    chain.inFn.mockResolvedValue({ data: null, error: new Error('boom') });
    await expect(fetchEntryRowsByClass(['c1'])).rejects.toThrow('boom');
  });
});
