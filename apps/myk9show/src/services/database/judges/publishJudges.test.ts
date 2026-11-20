import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';
import {
  PremiumPublishError,
  premiumPublishFailureMessage,
} from '@/features/premium/premiumPublishErrors';

const server = vi.hoisted(() => ({
  range: vi.fn(),
  order: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
}));
const device = vi.hoisted(() => ({ read: vi.fn() }));
const queue = vi.hoisted(() => ({
  requestUpload: vi.fn(),
  getPendingMutationsForTable: vi.fn(),
  getFailedMutations: vi.fn(),
}));
const replicas = vi.hoisted(() => ({ getTrialsByShow: vi.fn(), getClassById: vi.fn() }));

vi.mock('../supabaseClient', () => ({
  supabase: { from: server.from },
  createDatabaseError,
}));
vi.mock('./assignmentReads', () => ({ readJudgeAssignmentsOrThrow: device.read }));
vi.mock('@/services/replication/sharedMutationManager', () => ({ mutationManager: queue }));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialsByShow: replicas.getTrialsByShow },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { getClassById: replicas.getClassById },
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
const onDevice = (personId: string, showId = 'show-1', classId: string | null = null) => ({
  id: `a-${personId}-${classId}`,
  personId,
  showId,
  classId,
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
    server.eq.mockReturnValue({ order: server.order });
    server.order.mockReturnValue({ range: server.range });
    server.range
      .mockReset()
      .mockResolvedValue({ data: [row('j1', 'Pat'), row('j2', 'Sam')], error: null });
    device.read.mockResolvedValue([onDevice('j1'), onDevice('j2')]);
    queue.getPendingMutationsForTable.mockResolvedValue([]);
    queue.getFailedMutations.mockResolvedValue([]);
    replicas.getTrialsByShow.mockResolvedValue([{ id: 'trial-1' }]);
    replicas.getClassById.mockImplementation(async (id: string) => ({
      id,
      trialId: id === 'other-class' ? 'trial-other' : 'trial-1',
    }));
  });

  it("lists the server's judges when the device agrees", async () => {
    const judges = await fetchShowJudgesForPublish('show-1');

    expect(server.from).toHaveBeenCalledWith('judge_assignments');
    expect(server.eq).toHaveBeenCalledWith('show_id', 'show-1');
    expect(judges.map(j => j.judgeName)).toEqual(['Pat Judge', 'Sam Judge']);
  });

  // MYK9-1327: a pick changes the class row at once, but the assignment replica names the old
  // judge until the pick uploads and the sync lands, so the comparison below would agree with the
  // server on the OLD judge and publish it.
  describe('an unsent set_class_judge pick', () => {
    const pick = (classId: string) => ({
      tableName: 'classes',
      rowId: classId,
      operation: 'UPDATE',
      rpc: { name: 'set_class_judge', args: { p_class_id: classId } },
    });

    it('blocks the publish while a pick for a class of the show is pending', async () => {
      queue.getPendingMutationsForTable.mockResolvedValue([pick('class-1')]);

      const error = await publishError();

      expect(error.code).toBe('judges-syncing');
      expect(queue.requestUpload).toHaveBeenCalled();
    });

    it('blocks the publish while a pick for a class of the show is parked for Retry', async () => {
      queue.getFailedMutations.mockResolvedValue([pick('class-1')]);

      expect((await publishError()).code).toBe('judges-syncing');
    });

    it('does not block for a pick on a class of another show, or an unrelated class write', async () => {
      queue.getPendingMutationsForTable.mockResolvedValue([
        pick('other-class'),
        { tableName: 'classes', rowId: 'class-1', operation: 'UPDATE' },
      ]);

      await expect(fetchShowJudgesForPublish('show-1')).resolves.toHaveLength(2);
    });

    it('treats an unreadable queue as unsent rather than publishing the old judge', async () => {
      queue.getFailedMutations.mockRejectedValue(new Error('IDB timeout'));

      expect((await publishError()).code).toBe('judges-syncing');
    });
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
    expect(premiumPublishFailureMessage(error)).toMatch(/haven't been sent yet/);
    expect(queue.requestUpload).toHaveBeenCalled();
  });

  it('stops when the device moved a class to a different judge', async () => {
    server.range.mockResolvedValue({
      data: [row('j1', 'Pat', 'c1'), row('j2', 'Sam', 'c2')],
      error: null,
    });
    device.read.mockResolvedValue([onDevice('j1', 'show-1', 'c2'), onDevice('j2', 'show-1', 'c1')]);

    expect((await publishError()).code).toBe('judges-syncing');
  });

  it('reads every page when a show has more rows than one response holds', async () => {
    const first = Array.from({ length: 1000 }, (_, i) => row(`p${i}`, 'P', `c${i}`));
    server.range
      .mockResolvedValueOnce({ data: first, error: null })
      .mockResolvedValueOnce({ data: [row('last', 'Lee')], error: null });
    device.read.mockRejectedValue(new Error('IDB timeout'));

    const judges = await fetchShowJudgesForPublish('show-1');

    expect(judges).toHaveLength(1001);
    expect(server.range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  // MYK9-2067: the premium prints each judge's city and state and the classes they judge.
  describe('residence and class labels', () => {
    const withPlace = (
      personId: string,
      place: { city: string | null; state: string | null },
      assigned: { element: string | null; level: string | null; section: string | null } | null
    ) => ({
      ...row(personId, 'Pat'),
      judge: {
        id: personId,
        first_name: 'Pat',
        last_name: 'Judge',
        judge_affiliation: null,
        ...place,
      },
      assigned_class: assigned,
    });

    it("asks for the judge's city and state and the class label parts", async () => {
      await fetchShowJudgesForPublish('show-1');

      expect(server.select).toHaveBeenCalledWith(
        expect.stringContaining('first_name, last_name, city, state')
      );
      expect(server.select).toHaveBeenCalledWith(
        expect.stringContaining('element, level, section')
      );
    });

    it("keys each judge's class labels by the trial the class belongs to", async () => {
      const inTrial = (name: string, date: string) => ({
        element: 'Container',
        level: 'Novice',
        section: 'A',
        trial: { name, date },
      });
      server.range.mockResolvedValue({
        data: [
          withPlace('j1', { city: null, state: null }, inTrial('Trial 1', '2026-05-01')),
          withPlace('j2', { city: null, state: null }, inTrial('Trial 2', '2026-05-02')),
        ],
        error: null,
      });
      device.read.mockRejectedValue(new Error('IDB timeout'));

      const judges = await fetchShowJudgesForPublish('show-1');

      expect(server.select).toHaveBeenCalledWith(expect.stringContaining('trial:trials'));
      expect(judges).toEqual([
        expect.objectContaining({
          judgeId: 'j1',
          classLabelsByTrial: [
            { trialName: 'Trial 1', trialDate: '2026-05-01', labels: ['Container Novice A'] },
          ],
        }),
        expect.objectContaining({
          judgeId: 'j2',
          classLabelsByTrial: [
            { trialName: 'Trial 2', trialDate: '2026-05-02', labels: ['Container Novice A'] },
          ],
        }),
      ]);
    });

    it('gives no class for a deleted class or a class in a deleted trial', async () => {
      server.range.mockResolvedValue({
        data: [
          withPlace('j1', { city: null, state: null }, {
            element: 'Container',
            level: 'Novice',
            section: 'A',
            deleted_at: '2026-05-01T00:00:00Z',
            trial: { name: 'Trial 1', date: '2026-05-01', deleted_at: null },
          } as never),
          withPlace('j2', { city: null, state: null }, {
            element: 'Interior',
            level: 'Novice',
            section: null,
            deleted_at: null,
            trial: { name: 'Trial 2', date: '2026-05-02', deleted_at: '2026-05-01T00:00:00Z' },
          } as never),
        ],
        error: null,
      });
      device.read.mockRejectedValue(new Error('IDB timeout'));

      const judges = await fetchShowJudgesForPublish('show-1');

      expect(judges).toEqual([
        expect.objectContaining({ judgeId: 'j1', classLabels: [], classLabelsByTrial: [] }),
        expect.objectContaining({ judgeId: 'j2', classLabels: [], classLabelsByTrial: [] }),
      ]);
    });

    // MYK9-2292: the publish read and the generator (trialJudges.ts) agree on the affiliation.
    it("asks for the judge's affiliation and carries it trimmed, null when blank", async () => {
      const place = { city: 'Springfield', state: 'IL' };
      server.range.mockResolvedValue({
        data: [
          {
            ...withPlace('j1', place, null),
            judge: {
              id: 'j1',
              first_name: 'Pat',
              last_name: 'Judge',
              ...place,
              judge_affiliation: '  ASCA-approved judge, Region 4 ',
            },
          },
          withPlace('j2', place, null),
        ],
        error: null,
      });
      device.read.mockRejectedValue(new Error('IDB timeout'));

      const judges = await fetchShowJudgesForPublish('show-1');

      expect(server.select).toHaveBeenCalledWith(expect.stringContaining('judge_affiliation'));
      expect(judges).toEqual([
        expect.objectContaining({ judgeId: 'j1', affiliation: 'ASCA-approved judge, Region 4' }),
        expect.objectContaining({ judgeId: 'j2', affiliation: null }),
      ]);
    });

    it('carries City, ST and each distinct class label, and no residence without a city', async () => {
      const novice = { element: 'Container', level: 'Novice', section: 'A' };
      server.range.mockResolvedValue({
        data: [
          withPlace('j1', { city: 'Springfield', state: 'IL' }, novice),
          withPlace('j1', { city: 'Springfield', state: 'IL' }, novice),
          withPlace(
            'j1',
            { city: 'Springfield', state: 'IL' },
            { element: 'Interior', level: 'Advanced', section: null }
          ),
          withPlace('j2', { city: null, state: 'TX' }, null),
        ],
        error: null,
      });
      device.read.mockRejectedValue(new Error('IDB timeout'));

      const judges = await fetchShowJudgesForPublish('show-1');

      expect(judges).toEqual([
        expect.objectContaining({
          judgeId: 'j1',
          residence: 'Springfield, IL',
          classLabels: ['Container Novice A', 'Interior Advanced'],
        }),
        expect.objectContaining({ judgeId: 'j2', residence: null, classLabels: [] }),
      ]);
    });
  });

  it("groups a judge's class rows into one judge", async () => {
    server.range.mockResolvedValue({
      data: [row('j1', 'Pat', 'c1'), row('j1', 'Pat', 'c2')],
      error: null,
    });
    device.read.mockResolvedValue([onDevice('j1', 'show-1', 'c1'), onDevice('j1', 'show-1', 'c2')]);

    const judges = await fetchShowJudgesForPublish('show-1');

    expect(judges).toEqual([
      expect.objectContaining({ judgeId: 'j1', assignedClasses: ['c1', 'c2'] }),
    ]);
  });

  it('throws when the server cannot be read, so publishing fails instead of listing none', async () => {
    server.range.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });

    const error = await fetchShowJudgesForPublish('show-1').catch((e: unknown) => e);

    expect(error).toBeTruthy();
    expect(error).not.toBeInstanceOf(PremiumPublishError);
  });
});
