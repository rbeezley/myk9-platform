import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

const server = vi.hoisted(() => ({
  eq: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
}));
const queue = vi.hoisted(() => ({
  uploadPendingMutations: vi.fn(),
  getPendingMutationsForTable: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: { from: server.from },
  createDatabaseError,
}));
vi.mock('@/services/replication/sharedMutationManager', () => ({ mutationManager: queue }));

import { fetchShowJudgesForPublish } from './publishJudges';

const row = (personId: string, first: string, classId: string | null = null) => ({
  person_id: personId,
  show_id: 'show-1',
  class_id: classId,
  invited_at: null,
  confirmed_at: '2026-09-01',
  judge: { id: personId, first_name: first, last_name: 'Judge' },
});
const waiting = (data: Record<string, unknown>) => ({ tableName: 'judge_assignments', data });

/**
 * MYK9-774: the Edit Show form's judges come from a device read, which is
 * empty when the read failed, and publishing them put out a premium with no
 * judges. The premium's judges come from the server, read only once this
 * device's queued judge edits (this save's or an earlier one's) have reached it.
 */
describe('fetchShowJudgesForPublish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    server.from.mockReturnValue({ select: server.select });
    server.select.mockReturnValue({ eq: server.eq });
    queue.uploadPendingMutations.mockResolvedValue([]);
    queue.getPendingMutationsForTable.mockResolvedValue([]);
  });

  it("lists the server's judges, read after the device's edits upload", async () => {
    server.eq.mockResolvedValue({ data: [row('j1', 'Pat'), row('j2', 'Sam')], error: null });

    const judges = await fetchShowJudgesForPublish('show-1');

    expect(judges.map(j => j.judgeName)).toEqual(['Pat Judge', 'Sam Judge']);
    expect(server.eq).toHaveBeenCalledWith('show_id', 'show-1');
    expect(queue.getPendingMutationsForTable).toHaveBeenCalledWith('judge_assignments');
    expect(queue.uploadPendingMutations.mock.invocationCallOrder[0]).toBeLessThan(
      server.from.mock.invocationCallOrder[0] ?? 0
    );
  });

  it("groups a judge's class rows into one judge", async () => {
    server.eq.mockResolvedValue({
      data: [row('j1', 'Pat', 'c1'), row('j1', 'Pat', 'c2')],
      error: null,
    });

    const judges = await fetchShowJudgesForPublish('show-1');

    expect(judges).toEqual([
      expect.objectContaining({ judgeId: 'j1', assignedClasses: ['c1', 'c2'] }),
    ]);
  });

  it.each([
    { label: 'an add or update for this show', pending: waiting({ id: 'a1', show_id: 'show-1' }) },
    { label: 'a delete, which names no show', pending: waiting({ id: 'a1' }) },
  ])('stops, without reading the server, while $label is still waiting', async ({ pending }) => {
    queue.getPendingMutationsForTable.mockResolvedValue([pending]);

    await expect(fetchShowJudgesForPublish('show-1')).rejects.toThrow(/haven't reached the server/);
    expect(server.from).not.toHaveBeenCalled();
  });

  it("goes ahead when the only waiting judge write is another show's", async () => {
    queue.getPendingMutationsForTable.mockResolvedValue([waiting({ id: 'a9', show_id: 'show-2' })]);
    server.eq.mockResolvedValue({ data: [row('j1', 'Pat')], error: null });

    const judges = await fetchShowJudgesForPublish('show-1');

    expect(judges.map(j => j.judgeId)).toEqual(['j1']);
  });

  it('throws when the server cannot be read, so publishing fails instead of listing none', async () => {
    server.eq.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });

    await expect(fetchShowJudgesForPublish('show-1')).rejects.toBeTruthy();
  });
});
