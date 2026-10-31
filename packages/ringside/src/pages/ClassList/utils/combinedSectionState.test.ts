import { describe, expect, it } from 'vitest';
import type { ClassEntry } from '../types';
import {
  mergeSectionPhase,
  withMergedSectionState,
  type PhaseSource,
} from './combinedSectionState';

const section = (fields: Partial<PhaseSource>): PhaseSource => ({
  class_status: 'in_progress',
  ...fields,
});

describe('mergeSectionPhase', () => {
  it('Briefing in both takes the earlier briefing time', () => {
    const a = section({ class_status: 'briefing', briefing_time: '10:00' });
    const b = section({ class_status: 'briefing', briefing_time: '10:30' });
    expect(mergeSectionPhase(a, b)).toEqual({ status: 'briefing', time: '10:00' });
    expect(mergeSectionPhase(b, a)).toEqual({ status: 'briefing', time: '10:00' });
  });

  it('Break in both takes the later break-until time', () => {
    const a = section({ class_status: 'break', break_until: '10:45' });
    const b = section({ class_status: 'break', break_until: '10:30' });
    expect(mergeSectionPhase(a, b)).toEqual({ status: 'break', time: '10:45' });
    expect(mergeSectionPhase(b, a)).toEqual({ status: 'break', time: '10:45' });
  });

  it('Break and Briefing mixed reads the Briefing section only', () => {
    const a = section({ class_status: 'break', break_until: '11:00' });
    const b = section({ class_status: 'briefing', briefing_time: '09:30' });
    expect(mergeSectionPhase(a, b)).toEqual({ status: 'briefing', time: '09:30' });
    expect(mergeSectionPhase(b, a)).toEqual({ status: 'briefing', time: '09:30' });
  });

  it('Offline Scoring on either section wins and carries no time', () => {
    const phase = section({ class_status: 'briefing', briefing_time: '10:00' });
    const offline = section({ class_status: 'offline-scoring' });
    expect(mergeSectionPhase(phase, offline)).toEqual({ status: 'offline-scoring' });
    expect(mergeSectionPhase(offline, phase)).toEqual({ status: 'offline-scoring' });
  });

  it('Start Time on different dates picks the earlier instant, not the earlier clock', () => {
    const late = section({
      class_status: 'start_time',
      revised_expected_start: '2026-10-31T04:00:00Z',
    });
    const nextDay = section({
      class_status: 'start_time',
      revised_expected_start: '2026-11-01T06:00:00Z',
    });
    expect(mergeSectionPhase(nextDay, late).time).toBe('2026-10-31T04:00:00Z');
    expect(mergeSectionPhase(late, nextDay).time).toBe('2026-10-31T04:00:00Z');
  });

  it('carries no time when neither section holds the merged phase', () => {
    const a = section({ class_status: 'completed' });
    const b = section({ class_status: 'setup' });
    expect(mergeSectionPhase(a, b)).toEqual({ status: 'in_progress' });
    expect(
      mergeSectionPhase(section({ class_status: 'briefing', briefing_time: '10:00' }), section({}))
    ).toEqual({ status: 'in_progress' });
  });
});

describe('withMergedSectionState phase time', () => {
  const card = (fields: Partial<ClassEntry>) => fields as ClassEntry;

  it("shows B's earlier briefing instead of A's arbitrary one", () => {
    const merged = withMergedSectionState(
      card({ class_status: 'briefing', briefing_time: '10:30' }),
      card({ class_status: 'briefing', briefing_time: '10:00' })
    );
    expect(merged.briefing_time).toBe('10:00');
  });

  it("does not keep A's phase time once the pair has moved on", () => {
    const merged = withMergedSectionState(
      card({ class_status: 'briefing', briefing_time: '10:00' }),
      card({ class_status: 'in_progress' })
    );
    expect(merged.class_status).toBe('in_progress');
    expect(merged.briefing_time).toBeUndefined();
  });

  it('takes the later break-until', () => {
    const merged = withMergedSectionState(
      card({ class_status: 'break', break_until: '10:30' }),
      card({ class_status: 'break', break_until: '10:45' })
    );
    expect(merged.break_until).toBe('10:45');
  });
});
