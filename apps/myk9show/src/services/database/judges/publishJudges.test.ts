import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

const server = vi.hoisted(() => ({
  eq: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: { from: server.from },
  createDatabaseError,
}));

import { fetchShowJudgesForPublish } from './publishJudges';

const row = (personId: string, first: string, classId: string | null = null) => ({
  person_id: personId,
  show_id: 'show-1',
  class_id: classId,
  invited_at: null,
  confirmed_at: '2026-09-01',
  judge: { id: personId, first_name: first, last_name: 'Judge' },
});
const judge = (judgeId: string, judgeName = judgeId) => ({
  judgeId,
  judgeName,
  assignedDate: '2026-09-01',
  assignedClasses: [],
});

/**
 * MYK9-774: the Edit Show form's judges come from a device read, which is
 * empty when the read failed, and publishing them put out a premium with no
 * judges. The premium's judges come from the server, with this save's own
 * changes applied (they are queued writes the server may not have yet).
 */
describe('fetchShowJudgesForPublish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    server.from.mockReturnValue({ select: server.select });
    server.select.mockReturnValue({ eq: server.eq });
  });

  it("lists the server's judges when the form's list failed to load", async () => {
    server.eq.mockResolvedValue({ data: [row('j1', 'Pat'), row('j2', 'Sam')], error: null });

    const judges = await fetchShowJudgesForPublish('show-1', [], []);

    expect(server.from).toHaveBeenCalledWith('judge_assignments');
    expect(server.eq).toHaveBeenCalledWith('show_id', 'show-1');
    expect(judges.map(j => j.judgeName)).toEqual(['Pat Judge', 'Sam Judge']);
  });

  it('groups a judge’s class rows into one judge', async () => {
    server.eq.mockResolvedValue({
      data: [row('j1', 'Pat', 'c1'), row('j1', 'Pat', 'c2')],
      error: null,
    });

    const judges = await fetchShowJudgesForPublish('show-1', [], []);

    expect(judges).toEqual([
      expect.objectContaining({ judgeId: 'j1', assignedClasses: ['c1', 'c2'] }),
    ]);
  });

  it('leaves off a judge this save removed, even if the server still has them', async () => {
    server.eq.mockResolvedValue({ data: [row('j1', 'Pat'), row('j2', 'Sam')], error: null });

    const judges = await fetchShowJudgesForPublish(
      'show-1',
      [judge('j1'), judge('j2')],
      [judge('j1')]
    );

    expect(judges.map(j => j.judgeId)).toEqual(['j1']);
  });

  it('includes a judge this save added before the server has them, once', async () => {
    server.eq.mockResolvedValue({ data: [row('j1', 'Pat')], error: null });

    const judges = await fetchShowJudgesForPublish(
      'show-1',
      [judge('j1')],
      [judge('j1'), judge('j3', 'New Judge')]
    );

    expect(judges.map(j => j.judgeName)).toEqual(['Pat Judge', 'New Judge']);
  });

  it('does not list an added judge twice when the server already has them', async () => {
    server.eq.mockResolvedValue({ data: [row('j1', 'Pat'), row('j3', 'Lee')], error: null });

    const judges = await fetchShowJudgesForPublish(
      'show-1',
      [judge('j1')],
      [judge('j1'), judge('j3', 'Lee Judge')]
    );

    expect(judges.map(j => j.judgeId)).toEqual(['j1', 'j3']);
  });

  it('throws when the server cannot be read, so publishing fails instead of listing none', async () => {
    server.eq.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });

    await expect(fetchShowJudgesForPublish('show-1', [], [])).rejects.toBeTruthy();
  });
});
