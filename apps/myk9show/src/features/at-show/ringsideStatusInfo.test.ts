import { describe, expect, it } from 'vitest';
import type { ClassInfo } from '@myk9/ringside';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import { buildRingsideStatusInfo, withCombinedStatusLabel } from './ringsideStatusInfo';

const TZ = 'America/Chicago';
const classWith = (fields: Partial<ReplicatedClass>) =>
  ({ classStatus: 'in_progress', ...fields }) as ReplicatedClass;

describe('buildRingsideStatusInfo statusLabel (MYK9-1526)', () => {
  it('words Briefing with its time', () => {
    const info = buildRingsideStatusInfo(
      classWith({ ringPhase: 'briefing', ringPhaseTime: '10:00:00' }),
      TZ
    );
    expect(info.statusLabel).toBe('Briefing 10:00 AM');
  });

  it('words Break with its until time', () => {
    const info = buildRingsideStatusInfo(
      classWith({ ringPhase: 'break', ringPhaseTime: '14:30:00' }),
      TZ
    );
    expect(info.statusLabel).toBe('Break Until 2:30 PM');
  });

  it('words Start Time from the announced Expected start', () => {
    const info = buildRingsideStatusInfo(
      classWith({ classStatus: 'upcoming', revisedExpectedStart: '2026-10-30T16:00:00Z' }),
      TZ
    );
    expect(info.statusLabel).toBe('Start Time 11:00 AM');
  });

  it('words Offline Scoring without a time', () => {
    const info = buildRingsideStatusInfo(classWith({ ringPhase: 'offline_scoring' }), TZ);
    expect(info.statusLabel).toBe('Offline Scoring');
  });

  it('leaves plain In Progress without a label', () => {
    const info = buildRingsideStatusInfo(classWith({}), TZ);
    expect(info).not.toHaveProperty('statusLabel');
  });
});

describe('withCombinedStatusLabel (MYK9-1526)', () => {
  const info = { className: 'x' } as ClassInfo;
  const label = (a: Partial<ReplicatedClass>, b: Partial<ReplicatedClass>) =>
    withCombinedStatusLabel(
      { ...info, statusLabel: 'stale' } as ClassInfo,
      classWith(a),
      classWith(b),
      { timezone: TZ } as ReplicatedTrial
    )?.statusLabel;

  it("shows B's Offline Scoring when A is plain In Progress, like the combined card", () => {
    expect(label({}, { ringPhase: 'offline_scoring' })).toBe('Offline Scoring');
  });

  it("drops A's own label when the merged pair has none", () => {
    expect(label({ ringPhase: 'briefing', ringPhaseTime: '10:00:00' }, {})).toBeUndefined();
  });

  it('keeps Briefing when both sections are in it', () => {
    const briefing = { ringPhase: 'briefing', ringPhaseTime: '10:00:00' } as const;
    expect(label(briefing, briefing)).toBe('Briefing 10:00 AM');
  });

  it("uses B's Briefing time when A is on Break and B is still in Briefing", () => {
    expect(
      label(
        { ringPhase: 'break', ringPhaseTime: '09:00:00' },
        { ringPhase: 'briefing', ringPhaseTime: '09:30:00' }
      )
    ).toBe('Briefing 9:30 AM');
  });

  it('picks the earlier Start Time by instant across dates, not by clock string', () => {
    const late = { classStatus: 'upcoming', revisedExpectedStart: '2026-10-31T04:00:00Z' };
    const nextDay = { classStatus: 'upcoming', revisedExpectedStart: '2026-11-01T06:00:00Z' };
    // 11:00 PM Oct 30 Chicago vs 1:00 AM Oct 31 Chicago: the instant, not "01:00" < "23:00".
    expect(label(nextDay, late)).toBe('Start Time 11:00 PM');
    expect(label(late, nextDay)).toBe('Start Time 11:00 PM');
  });

  it('words the merged status with no time when neither section holds it', () => {
    expect(label({ classStatus: 'completed' }, { classStatus: 'upcoming' })).toBeUndefined();
  });
});
