import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';
import {
  PremiumPublishError,
  premiumPublishFailureMessage,
} from '@/features/premium/premiumPublishErrors';

const server = vi.hoisted(() => ({ eq: vi.fn(), select: vi.fn(), from: vi.fn() }));
const device = vi.hoisted(() => ({ read: vi.fn() }));
const queue = vi.hoisted(() => ({ requestUpload: vi.fn() }));

vi.mock('../supabaseClient', () => ({
  supabase: { from: server.from },
  createDatabaseError,
}));
vi.mock('./assignmentReads', () => ({ readJudgeAssignmentsOrThrow: device.read }));
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
const onDevice = (personId: string, showId = 'show-1') => ({
  id: `a-${personId}`,
  personId,
  showId,
});

async function publishError(): Promise<PremiumPublishError> {
  const error = await fetchShowJudgesForPublish('show-1').catch((e: unknown) => e);
  expect(error).toBeInstanceOf(PremiumPublishError);
  return error as PremiumPublishError;
}

/**
 * MYK9-774: the Edit Show form's judges come from a device read, which is
 * empty when the read failed, and publishing them put out a premium with no
 * judges. The premium lists the server's judges, and only when this device
 * agrees with them: a disagreement means a change has not landed on one side.
 */
describe('fetchShowJudgesForPublish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    server.from.mockReturnValue({ select: server.select });
    server.select.mockReturnValue({ eq: server.eq });
    server.eq.mockResolvedValue({ data: [row('j1', 'Pat'), row('j2', 'Sam')], error: null });
    device.read.mockResolvedValue([onDevice('j1'), onDevice('j2')]);
  });

  it("lists the server's judges when the device agrees", async () => {
    const judges = await fetchShowJudgesForPublish('show-1');

    expect(server.from).toHaveBeenCalledWith('judge_assignments');
    expect(server.eq).toHaveBeenCalledWith('show_id', 'show-1');
    expect(judges.map(j => j.judgeName)).toEqual(['Pat Judge', 'Sam Judge']);
  });

  it("lists the server's judges when the device cannot read its own", async () => {
    device.read.mockRejectedValue(new Error('IDB timeout'));

    const judges = await fetchShowJudgesForPublish('show-1');

    expect(judges.map(j => j.judgeId)).toEqual(['j1', 'j2']);
  });

  it("ignores the device's judges for other shows", async () => {
    device.read.mockResolvedValue([onDevice('j1'), onDevice('j2'), onDevice('j9', 'show-2')]);

    await expect(fetchShowJudgesForPublish('show-1')).resolves.toHaveLength(2);
  });

  it.each([
    { label: 'has a judge the server does not have yet', ids: ['j1', 'j2', 'j3'] },
    { label: 'is missing a judge the server still lists', ids: ['j1'] },
  ])('stops and asks for an upload when the device $label', async ({ ids }) => {
    device.read.mockResolvedValue(ids.map(id => onDevice(id)));

    const error = await publishError();

    expect(error.code).toBe('judges-syncing');
    expect(premiumPublishFailureMessage(error)).toMatch(/haven't reached the server/);
    expect(queue.requestUpload).toHaveBeenCalled();
  });

  it("groups a judge's class rows into one judge", async () => {
    server.eq.mockResolvedValue({
      data: [row('j1', 'Pat', 'c1'), row('j1', 'Pat', 'c2')],
      error: null,
    });
    device.read.mockResolvedValue([onDevice('j1')]);

    const judges = await fetchShowJudgesForPublish('show-1');

    expect(judges).toEqual([
      expect.objectContaining({ judgeId: 'j1', assignedClasses: ['c1', 'c2'] }),
    ]);
  });

  it('throws when the server cannot be read, so publishing fails instead of listing none', async () => {
    server.eq.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });

    const error = await fetchShowJudgesForPublish('show-1').catch((e: unknown) => e);

    expect(error).toBeTruthy();
    expect(error).not.toBeInstanceOf(PremiumPublishError);
  });
});
