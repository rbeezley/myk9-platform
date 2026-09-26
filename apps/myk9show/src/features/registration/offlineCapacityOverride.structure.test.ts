import { onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadOfflineCapacityOverrides } from './offlineCapacityOverride';

/**
 * MYK9-788: a cold but readable classes, trials or shows replica read as "no
 * class, no trial date, default capacity", so a full class recorded
 * capacity_override=false as fact. The show's structure must be on the device
 * before anything is counted: synced once when online, refused otherwise.
 */

const SHOW_ID = 'show-1';
const SHOW = { id: SHOW_ID, defaultJudgeDayCapacity: 125 };
const TRIAL = { id: 'trial-1', date: '2026-10-10', showId: SHOW_ID };
// Full: one spot, one confirmed entry already in it.
const CLASS = { id: 'class-1', trialId: 'trial-1', maxEntries: 1 };
const SELECTION = [{ key: 'dog-new|class-1', classId: 'class-1' }];

const state = vi.hoisted(() => ({
  show: null as Record<string, unknown> | null,
  trials: [] as Array<Record<string, unknown>>,
  classes: [] as Array<Record<string, unknown>>,
  // What each sync puts on the device when it runs.
  onSync: {
    show: null as Record<string, unknown> | null,
    trials: [] as unknown[],
    classes: [] as unknown[],
  },
  showsSync: vi.fn(),
  trialsSync: vi.fn(),
  classesSync: vi.fn(),
}));

vi.mock('@/services/database/entries/requireShowEntriesSynced', () => ({
  requireShowEntriesSynced: vi.fn(async () => undefined),
}));

vi.mock('@/services/database/judges/assignmentReads', () => ({
  readJudgeAssignmentsOrThrow: vi.fn(async () => []),
}));

vi.mock('@/services/replication', () => ({
  replicatedShowsTable: {
    getShowById: vi.fn(async () => state.show),
    sync: (...args: unknown[]) => state.showsSync(...args),
  },
  replicatedTrialsTable: {
    getAllWithStatus: vi.fn(async () => ({ ok: true, rows: state.trials, error: null })),
    getTrialsByShow: vi.fn(async (showId: string) =>
      state.trials.filter(trial => trial.showId === showId)
    ),
    sync: (...args: unknown[]) => state.trialsSync(...args),
  },
  replicatedClassesTable: {
    getAllWithStatus: vi.fn(async () => ({ ok: true, rows: state.classes, error: null })),
    sync: (...args: unknown[]) => state.classesSync(...args),
  },
  replicatedEntriesTable: {
    getAllWithStatus: vi.fn(async () => ({
      ok: true,
      rows: [{ showId: SHOW_ID, classId: 'class-1', entryStatus: 'confirmed' }],
      error: null,
    })),
  },
}));

function deviceHolds(parts: { show?: boolean; trials?: boolean; classes?: boolean }) {
  state.show = parts.show === false ? null : SHOW;
  state.trials = parts.trials === false ? [] : [TRIAL];
  state.classes = parts.classes === false ? [] : [CLASS];
}

describe('offline capacity check on a show whose structure is not on the device (MYK9-788)', () => {
  beforeEach(() => {
    onlineManager.setOnline(true);
    state.onSync = { show: SHOW, trials: [TRIAL], classes: [CLASS] };
    state.showsSync.mockReset();
    state.showsSync.mockImplementation(async () => {
      state.show = state.onSync.show;
      return { success: true };
    });
    state.trialsSync.mockReset();
    state.trialsSync.mockImplementation(async () => {
      state.trials = state.onSync.trials as Array<Record<string, unknown>>;
      return { success: true };
    });
    state.classesSync.mockReset();
    state.classesSync.mockImplementation(async () => {
      state.classes = state.onSync.classes as Array<Record<string, unknown>>;
      return { success: true };
    });
  });

  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('counts a warm show from the device without syncing', async () => {
    deviceHolds({});
    await expect(loadOfflineCapacityOverrides(SHOW_ID, SELECTION)).resolves.toEqual({
      'dog-new|class-1': true,
    });
    expect(state.trialsSync).not.toHaveBeenCalled();
    expect(state.classesSync).not.toHaveBeenCalled();
    expect(state.showsSync).not.toHaveBeenCalled();
  });

  it.each([
    ['classes', { classes: false }],
    ['trials', { trials: false }],
    ['show', { show: false }],
  ] as const)('refuses offline when the %s replica is cold', async (_label, cold) => {
    deviceHolds(cold);
    onlineManager.setOnline(false);
    await expect(loadOfflineCapacityOverrides(SHOW_ID, SELECTION)).rejects.toThrow(
      "This show's classes haven't finished loading on this device."
    );
    expect(state.trialsSync).not.toHaveBeenCalled();
    expect(state.classesSync).not.toHaveBeenCalled();
    expect(state.showsSync).not.toHaveBeenCalled();
  });

  it.each([
    ['classes', { classes: false }],
    ['trials', { trials: false }],
    ['show', { show: false }],
  ] as const)(
    'online, syncs the show once when the %s replica is cold, then counts the full class',
    async (_label, cold) => {
      deviceHolds(cold);
      await expect(loadOfflineCapacityOverrides(SHOW_ID, SELECTION)).resolves.toEqual({
        'dog-new|class-1': true,
      });
      expect(state.trialsSync).toHaveBeenCalledTimes(1);
      expect(state.trialsSync).toHaveBeenCalledWith(SHOW_ID, { forceFullSync: true });
      expect(state.classesSync).toHaveBeenCalledTimes(1);
      expect(state.classesSync).toHaveBeenCalledWith('trial-1', { forceFullSync: true });
    }
  );

  it('syncs the shows table only when the show row is the missing piece', async () => {
    deviceHolds({ classes: false });
    await loadOfflineCapacityOverrides(SHOW_ID, SELECTION);
    expect(state.showsSync).not.toHaveBeenCalled();

    deviceHolds({ show: false });
    await loadOfflineCapacityOverrides(SHOW_ID, SELECTION);
    expect(state.showsSync).toHaveBeenCalledWith('', { forceFullSync: true });
  });

  it.each([
    ['classes', { classes: false }, { classes: [] as unknown[] }],
    ['trials', { trials: false }, { trials: [] as unknown[] }],
    ['show', { show: false }, { show: null }],
  ] as const)(
    'online, refuses when the sync still leaves the %s missing',
    async (_label, cold, afterSync) => {
      deviceHolds(cold);
      state.onSync = { ...state.onSync, ...afterSync };
      await expect(loadOfflineCapacityOverrides(SHOW_ID, SELECTION)).rejects.toThrow(
        "This show's classes haven't finished loading on this device."
      );
    }
  );

  it('refuses when a selected class belongs to a trial of another show', async () => {
    deviceHolds({});
    state.classes = [{ ...CLASS, trialId: 'trial-elsewhere' }];
    state.onSync = { ...state.onSync, classes: state.classes };
    await expect(loadOfflineCapacityOverrides(SHOW_ID, SELECTION)).rejects.toThrow(
      "This show's classes haven't finished loading on this device."
    );
  });
});
