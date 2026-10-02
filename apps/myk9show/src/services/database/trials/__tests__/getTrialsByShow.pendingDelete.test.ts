import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * MYK9-911: deleting a show's last trial empties the trial store, which makes
 * getTrialsByShow's empty-result verification read PostgREST. The server still
 * has the trial until the queued DELETE uploads, so the deleted trial came back.
 * The read must drop every id this device has a queued DELETE for.
 */

const { mockTrialsTable, mockShowsTable, serverRows } = vi.hoisted(() => ({
  mockTrialsTable: {
    getTrialsByShow: vi.fn(),
    pendingDeletes: { coveredIds: vi.fn() },
  },
  mockShowsTable: { getShowById: vi.fn() },
  serverRows: { current: [] as Array<Record<string, unknown>> },
}));

vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: mockTrialsTable,
}));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: mockShowsTable,
}));
vi.mock('../../supabaseClient', async importOriginal => {
  const actual = await importOriginal<typeof import('../../supabaseClient')>();
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is']) builder[m] = () => builder;
  builder.order = () => Promise.resolve({ data: serverRows.current, error: null });
  return { ...actual, supabase: { from: () => builder } };
});

import { getTrialsByShow } from '../reads';

const serverTrial = (id: string) => ({ id, show_id: 'show-1', date: '2026-10-01', show: null });
const idsOf = (data: unknown) => (data as Array<{ id: string }>).map(r => r.id);

describe('getTrialsByShow with a queued trial delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTrialsTable.getTrialsByShow.mockResolvedValue([]);
    mockShowsTable.getShowById.mockResolvedValue({ id: 'show-1' });
    serverRows.current = [serverTrial('t-deleted')];
  });

  it('keeps the list empty when the only server trial has a queued delete', async () => {
    mockTrialsTable.pendingDeletes.coveredIds.mockResolvedValue(new Set(['t-deleted']));

    const result = await getTrialsByShow('show-1');

    expect(mockTrialsTable.pendingDeletes.coveredIds).toHaveBeenCalledWith('show-1');
    expect(idsOf(result.data)).toEqual([]);
  });

  it('still returns server trials that have no queued delete', async () => {
    serverRows.current = [serverTrial('t-deleted'), serverTrial('t-live')];
    mockTrialsTable.pendingDeletes.coveredIds.mockResolvedValue(new Set(['t-deleted']));

    const result = await getTrialsByShow('show-1');

    expect(idsOf(result.data)).toEqual(['t-live']);
  });

  it('drops the deleted trial when the show is not in the replica either', async () => {
    mockShowsTable.getShowById.mockResolvedValue(null);
    mockTrialsTable.pendingDeletes.coveredIds.mockResolvedValue(new Set(['t-deleted']));

    const result = await getTrialsByShow('show-1');

    expect(idsOf(result.data)).toEqual([]);
  });

  it('returns the server trial when nothing is queued (cold store stays honest)', async () => {
    mockTrialsTable.pendingDeletes.coveredIds.mockResolvedValue(new Set());

    const result = await getTrialsByShow('show-1');

    expect(idsOf(result.data)).toEqual(['t-deleted']);
  });
});
