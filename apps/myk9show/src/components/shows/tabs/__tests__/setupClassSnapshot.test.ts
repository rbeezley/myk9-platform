import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSetupClass } from '../setupClassSnapshot';
import {
  classToFormData,
  trialClassToFormData,
} from '@/components/panels/edit/ClassEditPanel.helpers';
import { mapClassInputToUpdate } from '@/services/mappers/classMappers';

// MYK9-900: the Setup editor gets the SAME shape Class Details gives ClassEditPanel
// (mapReplicatedClassToDbRow -> mapDatabaseToClass), not the raw replica row.

const getClassById = vi.hoisted(() => vi.fn());
const getTrialById = vi.hoisted(() => vi.fn());
const sync = vi.hoisted(() => vi.fn());

vi.mock('@/services/replication', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/replication')>();
  return {
    ...actual,
    replicatedClassesTable: { ...actual.replicatedClassesTable, getClassById, sync },
    replicatedTrialsTable: { ...actual.replicatedTrialsTable, getTrialById },
  };
});

const rawReplicaRow = {
  id: 'c1',
  trialId: 't1',
  name: 'Novice Containers',
  element: 'Containers',
  level: 'Novice',
  section: 'A',
  classStatus: 'in_progress', // raw DB value
  judgeId: 'j1',
  judgeName: 'Jane Judge',
  startTime: '2026-05-09T09:00:00',
};

describe('resolveSetupClass', () => {
  beforeEach(() => {
    getClassById.mockReset().mockResolvedValue(rawReplicaRow);
    getTrialById.mockReset().mockResolvedValue({
      id: 't1',
      name: 'Saturday Trial',
      date: '2026-05-09',
      trialNumber: '1',
      status: 'upcoming',
    });
    sync.mockReset().mockResolvedValue(undefined);
  });

  it('maps the raw replica row into the editor shape', async () => {
    const snapshot = await resolveSetupClass('c1', 't1');

    expect(snapshot).toMatchObject({
      id: 'c1',
      status: 'In Progress', // not 'in_progress'
      element: 'Containers',
      level: 'Novice',
      section: 'A',
      judgeId: 'j1',
      judge: 'Jane Judge',
      trial: 'Saturday Trial',
      trialId: 't1',
    });
    expect(sync).not.toHaveBeenCalled();
  });

  it('feeds the editor form with the title-case status and the judge', async () => {
    const snapshot = await resolveSetupClass('c1', 't1');
    if (!snapshot) throw new Error('expected a snapshot');

    expect(classToFormData(snapshot)).toMatchObject({
      status: 'In Progress',
      element: 'Containers',
      level: 'Novice',
      section: 'A',
      judgeId: 'j1',
      judge: 'Jane Judge',
    });
    // The compact (simple) form the panel opens with for this shape.
    expect(trialClassToFormData(snapshot as never)).toMatchObject({
      status: 'In Progress',
      element: 'Containers',
      judgeId: 'j1',
    });
  });

  it('saving sends the DB value back: In Progress maps to in_progress', async () => {
    const snapshot = await resolveSetupClass('c1', 't1');
    expect(snapshot?.status).toBe('In Progress');
    expect(mapClassInputToUpdate({ status: snapshot?.status })).toMatchObject({
      status: 'in_progress',
    });
  });

  it('hydrates a cold replica, then maps what arrived', async () => {
    getClassById.mockResolvedValueOnce(null).mockResolvedValue(rawReplicaRow);

    const snapshot = await resolveSetupClass('c1', 't1');

    expect(sync).toHaveBeenCalledWith('t1', expect.anything());
    expect(snapshot?.status).toBe('In Progress');
  });

  it('is null when the class is still absent after hydrating', async () => {
    getClassById.mockResolvedValue(null);
    expect(await resolveSetupClass('c1', 't1')).toBeNull();
  });
});
