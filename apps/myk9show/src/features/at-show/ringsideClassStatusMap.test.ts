import { describe, it, expect } from 'vitest';
import type { ClassStatusValue } from '@myk9/ringside';
import {
  toRingsideClassStatus,
  toShowClassStatus,
  toShowClassStatusWrite,
  toStatusUpdateFields,
} from './ringsideClassStatusMap';

const ALL: ClassStatusValue[] = [
  'no-status',
  'setup',
  'briefing',
  'break',
  'start_time',
  'in_progress',
  'offline-scoring',
  'completed',
];

describe('toShowClassStatusWrite', () => {
  it('keeps the overlapping statuses and sets no phase', () => {
    expect(toShowClassStatusWrite('setup')).toEqual({ classStatus: 'setup', ringPhase: null });
    expect(toShowClassStatusWrite('in_progress')).toEqual({
      classStatus: 'in_progress',
      ringPhase: null,
    });
    expect(toShowClassStatusWrite('completed')).toEqual({
      classStatus: 'completed',
      ringPhase: null,
    });
  });

  it('stores briefing, break and offline scoring as a phase of an in-progress class', () => {
    expect(toShowClassStatusWrite('briefing')).toEqual({
      classStatus: 'in_progress',
      ringPhase: 'briefing',
    });
    expect(toShowClassStatusWrite('break')).toEqual({
      classStatus: 'in_progress',
      ringPhase: 'break',
    });
    expect(toShowClassStatusWrite('offline-scoring')).toEqual({
      classStatus: 'in_progress',
      ringPhase: 'offline_scoring',
    });
  });

  it('maps Start Time and No Status to an unstarted class with no phase', () => {
    expect(toShowClassStatusWrite('start_time')).toEqual({
      classStatus: 'upcoming',
      ringPhase: null,
    });
    expect(toShowClassStatus('no-status')).toBe('upcoming');
  });
});

describe('toRingsideClassStatus', () => {
  it('round-trips every ringside status through status + phase + Expected start', () => {
    for (const status of ALL) {
      const { classStatus, ringPhase } = toShowClassStatusWrite(status);
      const revisedExpectedStart = status === 'start_time' ? '2026-11-01T15:00:00.000Z' : null;
      expect(toRingsideClassStatus({ classStatus, ringPhase, revisedExpectedStart })).toBe(status);
    }
  });

  it('keeps a phase the server derivation left on an unstarted class', () => {
    expect(toRingsideClassStatus({ classStatus: 'upcoming', ringPhase: 'break' })).toBe('break');
    expect(toRingsideClassStatus({ classStatus: 'upcoming', ringPhase: 'briefing' })).toBe(
      'briefing'
    );
  });

  it('ignores a ring phase once the class is completed or in setup', () => {
    expect(toRingsideClassStatus({ classStatus: 'completed', ringPhase: 'break' })).toBe(
      'completed'
    );
    expect(toRingsideClassStatus({ classStatus: 'setup', ringPhase: 'briefing' })).toBe('setup');
  });

  it('reads an unstarted class as Start Time only when it has an Expected start', () => {
    expect(toRingsideClassStatus({ classStatus: 'upcoming' })).toBe('no-status');
    expect(
      toRingsideClassStatus({ classStatus: 'upcoming', revisedExpectedStart: '2026-11-01T15:00Z' })
    ).toBe('start_time');
    expect(toRingsideClassStatus({ classStatus: undefined })).toBe('no-status');
  });

  it('reads cancelled as no status, and a bare status string as before', () => {
    expect(toRingsideClassStatus({ classStatus: 'cancelled' })).toBe('no-status');
    expect(toRingsideClassStatus('in_progress')).toBe('in_progress');
    expect(toRingsideClassStatus('In Progress')).toBe('in_progress');
  });
});

describe('toStatusUpdateFields', () => {
  it('routes the entered time to the field the status owns', () => {
    expect(toStatusUpdateFields('briefing', '10:00')).toEqual({ briefing_time: '10:00' });
    expect(toStatusUpdateFields('break', '10:30')).toEqual({ break_until: '10:30' });
    expect(toStatusUpdateFields('start_time', '11:00')).toEqual({ start_time: '11:00' });
  });

  it('drops a time for a status that takes none, and a blank time', () => {
    expect(toStatusUpdateFields('in_progress', '10:00')).toBeUndefined();
    expect(toStatusUpdateFields('briefing', undefined)).toBeUndefined();
  });
});
