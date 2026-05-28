import { describe, it, expect } from 'vitest';
import { toShowClassStatus } from './ringsideClassStatusMap';
import type { ClassStatusValue } from '@myk9/ringside';

describe('toShowClassStatus', () => {
  it('passes through the overlapping statuses', () => {
    expect(toShowClassStatus('setup')).toBe('setup');
    expect(toShowClassStatus('in_progress')).toBe('in_progress');
    expect(toShowClassStatus('completed')).toBe('completed');
  });

  it('collapses ringside-only active statuses to in_progress (lossy spike mapping)', () => {
    expect(toShowClassStatus('briefing')).toBe('in_progress');
    expect(toShowClassStatus('break')).toBe('in_progress');
    expect(toShowClassStatus('start_time')).toBe('in_progress');
    expect(toShowClassStatus('offline-scoring')).toBe('in_progress');
  });

  it('maps no-status to upcoming', () => {
    expect(toShowClassStatus('no-status')).toBe('upcoming');
  });

  it('maps every ringside ClassStatusValue to a valid myK9Show status', () => {
    const all: ClassStatusValue[] = [
      'no-status',
      'setup',
      'briefing',
      'break',
      'start_time',
      'in_progress',
      'offline-scoring',
      'completed',
    ];
    const valid = new Set(['setup', 'in_progress', 'completed', 'cancelled', 'upcoming']);
    for (const s of all) {
      expect(valid.has(toShowClassStatus(s))).toBe(true);
    }
  });
});
