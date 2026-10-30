/**
 * MYK9-1513: ringside's status change reaches the class replica as a class status
 * plus a ring phase (and the phase time / Expected start), so it queues offline
 * through the same updateClass path as every other class write.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { updateClass, getClass, getTrial } = vi.hoisted(() => ({
  updateClass: vi.fn(),
  getClass: vi.fn(),
  getTrial: vi.fn(),
}));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { updateClass, get: getClass },
  replicatedTrialsTable: { get: getTrial },
}));

import { buildRingsideReplication } from './ringsideCapabilities';

describe('buildRingsideReplication.updateClassStatus (MYK9-1513)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateClass.mockResolvedValue(undefined);
    getClass.mockResolvedValue({ id: 'c1', trialId: 't1' });
    getTrial.mockResolvedValue({ id: 't1', date: '2026-11-01', timezone: 'America/Chicago' });
  });

  it('writes Briefing as an in-progress class in the briefing phase with its time', async () => {
    await buildRingsideReplication().updateClassStatus('c1', 'briefing', {
      briefing_time: '10:00',
    });
    expect(updateClass).toHaveBeenCalledWith('c1', {
      classStatus: 'in_progress',
      ringPhase: 'briefing',
      ringPhaseTime: '10:00:00',
    });
  });

  it('writes Break with its "until" time', async () => {
    await buildRingsideReplication().updateClassStatus('c1', 'break', { break_until: '10:30' });
    expect(updateClass).toHaveBeenCalledWith('c1', {
      classStatus: 'in_progress',
      ringPhase: 'break',
      ringPhaseTime: '10:30:00',
    });
  });

  it('writes Offline Scoring as a phase with no time', async () => {
    await buildRingsideReplication().updateClassStatus('c1', 'offline-scoring');
    expect(updateClass).toHaveBeenCalledWith('c1', {
      classStatus: 'in_progress',
      ringPhase: 'offline_scoring',
      ringPhaseTime: null,
    });
  });

  it('clears the phase and its time when the class goes back to In Progress or completes', async () => {
    const replication = buildRingsideReplication();
    await replication.updateClassStatus('c1', 'in_progress');
    await replication.updateClassStatus('c1', 'completed');
    expect(updateClass).toHaveBeenNthCalledWith(1, 'c1', {
      classStatus: 'in_progress',
      ringPhase: null,
      ringPhaseTime: null,
    });
    expect(updateClass).toHaveBeenNthCalledWith(2, 'c1', {
      classStatus: 'completed',
      ringPhase: null,
      ringPhaseTime: null,
    });
  });

  it("sets Start Time as the Expected start instant in the trial's timezone", async () => {
    await buildRingsideReplication().updateClassStatus('c1', 'start_time', { start_time: '11:00' });
    expect(updateClass).toHaveBeenCalledWith('c1', {
      classStatus: 'upcoming',
      ringPhase: null,
      ringPhaseTime: null,
      revisedExpectedStart: '2026-11-01T17:00:00.000Z',
    });
  });

  it('refuses Start Time without a time, and writes nothing', async () => {
    await expect(buildRingsideReplication().updateClassStatus('c1', 'start_time')).rejects.toThrow(
      'Start Time needs a time'
    );
    expect(updateClass).not.toHaveBeenCalled();
  });

  it('No Status also clears the Expected start', async () => {
    await buildRingsideReplication().updateClassStatus('c1', 'no-status');
    expect(updateClass).toHaveBeenCalledWith('c1', {
      classStatus: 'upcoming',
      ringPhase: null,
      ringPhaseTime: null,
      revisedExpectedStart: null,
    });
  });
});
