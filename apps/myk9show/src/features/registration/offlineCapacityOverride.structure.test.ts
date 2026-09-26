import { onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadOfflineCapacityOverrides } from './offlineCapacityOverride';

/**
 * MYK9-788: a cold but readable classes, trials, shows or judge-assignments
 * replica read as "no class, no trial date, no judge, default capacity", so a
 * full class or judge-day recorded capacity_override=false as fact. The show's
 * whole structure must be on the device before anything is counted, by sync
 * coverage rather than by the selected rows being present: a judge-day spans
 * classes the desk never selected. Online it is synced once; otherwise the
 * entry is refused.
 */

const SHOW_ID = 'show-1';
const SHOW = { id: SHOW_ID, defaultJudgeDayCapacity: 125 };
const TRIAL = { id: 'trial-1', date: '2026-10-10', showId: SHOW_ID };
// class-1 has room; class-2 shares its judge, whose day holds one entry and has one.
const CLASS_1 = { id: 'class-1', trialId: 'trial-1', maxEntries: 10 };
const CLASS_2 = { id: 'class-2', trialId: 'trial-1', maxEntries: 10 };
const assignment = (classId: string) => ({
  id: `assign-${classId}`,
  showId: SHOW_ID,
  classId,
  personId: 'judge-1',
  status: 'confirmed',
  dayCapacityOverride: 1,
});
const ASSIGNMENTS = [assignment('class-1'), assignment('class-2')];
const SELECTION = [{ key: 'dog-new|class-1', classId: 'class-1' }];
const NOT_LOADED = "This show's classes haven't finished loading on this device.";

type Row = Record<string, unknown>;
interface Device {
  show: Row | null;
  trials: Row[];
  trialsExpected: number | undefined;
  classes: Row[];
  classesExpected: number | undefined;
  assignments: Row[];
  assignmentsExpected: number | undefined;
}

const WHOLE: Device = {
  show: SHOW,
  trials: [TRIAL],
  trialsExpected: 1,
  classes: [CLASS_1, CLASS_2],
  classesExpected: 2,
  assignments: ASSIGNMENTS,
  assignmentsExpected: 2,
};

const state = vi.hoisted(() => ({
  device: {} as Device,
  // What the device holds once a sync has run.
  afterSync: {} as Device,
  sync: vi.fn(),
}));

vi.mock('@/services/database/entries/requireShowEntriesSynced', () => ({
  requireShowEntriesSynced: vi.fn(async () => undefined),
}));

vi.mock('@/services/database/judges/assignmentReads', () => ({
  readJudgeAssignmentsOrThrow: vi.fn(async () => state.device.assignments),
}));

vi.mock('@/services/replication', () => {
  const meta = (expected: number | undefined) =>
    expected === undefined ? { tableName: 't' } : { tableName: 't', expectedRemoteRows: expected };
  const syncing =
    (table: string) =>
    async (...args: unknown[]) => {
      state.sync(table, ...args);
      state.device = { ...state.afterSync };
      return { success: true };
    };
  return {
    replicatedShowsTable: {
      getShowById: vi.fn(async () => state.device.show),
      sync: syncing('shows'),
    },
    replicatedTrialsTable: {
      getAllWithStatus: vi.fn(async () => ({ ok: true, rows: state.device.trials, error: null })),
      getTrialsByShow: vi.fn(async (showId: string) =>
        state.device.trials.filter(trial => trial.showId === showId)
      ),
      getByShowWithStatus: vi.fn(async (showId: string) => ({
        ok: true,
        rows: state.device.trials.filter(trial => trial.showId === showId),
        error: null,
      })),
      getSyncMetadata: vi.fn(async () => meta(state.device.trialsExpected)),
      pendingDeletes: { coveredIds: vi.fn(async () => new Set<string>()) },
      sync: syncing('trials'),
    },
    replicatedClassesTable: {
      getAllWithStatus: vi.fn(async () => ({ ok: true, rows: state.device.classes, error: null })),
      getClassesByTrial: vi.fn(async (trialId: string) =>
        state.device.classes.filter(entryClass => entryClass.trialId === trialId)
      ),
      getSyncMetadata: vi.fn(async () => meta(state.device.classesExpected)),
      sync: syncing('classes'),
    },
    replicatedJudgeAssignmentsTable: {
      getByShowWithStatus: vi.fn(async (showId: string) => ({
        ok: true,
        rows: state.device.assignments.filter(row => row.showId === showId),
        error: null,
      })),
      getSyncMetadata: vi.fn(async () => meta(state.device.assignmentsExpected)),
      sync: syncing('assignments'),
    },
    replicatedEntriesTable: {
      getByShowWithStatus: vi.fn(async () => ({
        ok: true,
        // The judge-day's one spot is taken by an entry in the class NOT selected.
        rows: [{ showId: SHOW_ID, classId: 'class-2', entryStatus: 'confirmed' }],
        error: null,
      })),
    },
  };
});

const COLD: Record<string, Partial<Device>> = {
  show: { show: null },
  trials: { trials: [], trialsExpected: undefined },
  classes: { classes: [], classesExpected: undefined },
  // The Codex P1 shape: the selected class and its trial are here, the other
  // class on the same judge-day is not.
  'other class on the judge-day': { classes: [CLASS_1], classesExpected: 2 },
  'judge assignments': { assignments: [], assignmentsExpected: undefined },
  // The selected class's trial is here; another trial of the show is not.
  'other trial of the show': { trialsExpected: 2 },
};
const coldCases = Object.entries(COLD);

describe('offline capacity check on a show whose structure is not whole on the device (MYK9-788)', () => {
  beforeEach(() => {
    onlineManager.setOnline(true);
    state.device = { ...WHOLE };
    state.afterSync = { ...WHOLE };
    state.sync.mockReset();
  });

  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('counts a whole show from the device without syncing: the full judge-day marks the entry', async () => {
    await expect(loadOfflineCapacityOverrides(SHOW_ID, SELECTION)).resolves.toEqual({
      'dog-new|class-1': true,
    });
    expect(state.sync).not.toHaveBeenCalled();
  });

  it.each(coldCases)('refuses offline when the %s is not on the device', async (_label, cold) => {
    state.device = { ...WHOLE, ...cold };
    onlineManager.setOnline(false);
    await expect(loadOfflineCapacityOverrides(SHOW_ID, SELECTION)).rejects.toThrow(NOT_LOADED);
    expect(state.sync).not.toHaveBeenCalled();
  });

  it.each(coldCases)(
    'online, syncs once when the %s is not on the device, then counts the full judge-day',
    async (_label, cold) => {
      state.device = { ...WHOLE, ...cold };
      await expect(loadOfflineCapacityOverrides(SHOW_ID, SELECTION)).resolves.toEqual({
        'dog-new|class-1': true,
      });
      expect(state.sync).toHaveBeenCalledWith('trials', SHOW_ID, { forceFullSync: true });
      expect(state.sync).toHaveBeenCalledWith('classes', 'trial-1', { forceFullSync: true });
    }
  );

  it.each(coldCases)(
    'online, refuses when the sync still leaves the %s missing',
    async (_label, cold) => {
      state.device = { ...WHOLE, ...cold };
      state.afterSync = { ...WHOLE, ...cold };
      await expect(loadOfflineCapacityOverrides(SHOW_ID, SELECTION)).rejects.toThrow(NOT_LOADED);
    }
  );

  it('syncs the shows and assignments tables only when they are the cold piece', async () => {
    state.device = { ...WHOLE, ...COLD.classes };
    await loadOfflineCapacityOverrides(SHOW_ID, SELECTION);
    const tables = () => state.sync.mock.calls.map(call => call[0]);
    expect(tables()).not.toContain('shows');
    expect(tables()).not.toContain('assignments');

    state.sync.mockReset();
    state.device = { ...WHOLE, ...COLD.show, ...COLD['judge assignments'] };
    await loadOfflineCapacityOverrides(SHOW_ID, SELECTION);
    expect(state.sync).toHaveBeenCalledWith('shows', '', { forceFullSync: true });
    expect(tables()).toContain('assignments');
  });

  it('refuses when a selected class belongs to a trial of another show', async () => {
    const elsewhere = {
      classes: [{ ...CLASS_1, trialId: 'trial-elsewhere' }, CLASS_2],
      classesExpected: 1,
    };
    state.device = { ...WHOLE, ...elsewhere };
    state.afterSync = { ...WHOLE, ...elsewhere };
    await expect(loadOfflineCapacityOverrides(SHOW_ID, SELECTION)).rejects.toThrow(NOT_LOADED);
  });
});
