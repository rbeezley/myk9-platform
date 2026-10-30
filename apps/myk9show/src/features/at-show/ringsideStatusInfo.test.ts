import { describe, expect, it } from 'vitest';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import { buildRingsideStatusInfo } from './ringsideStatusInfo';

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
