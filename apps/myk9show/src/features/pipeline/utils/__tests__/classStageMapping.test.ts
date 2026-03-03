import { describe, it, expect } from 'vitest';
import { mapClassToStage, groupClassesByStage } from '../classStageMapping';

describe('mapClassToStage', () => {
  it('maps null/undefined status to not-started', () => {
    expect(mapClassToStage(null, false)).toBe('not-started');
    expect(mapClassToStage(undefined, null)).toBe('not-started');
  });

  it('maps no-status to not-started', () => {
    expect(mapClassToStage('no-status', false)).toBe('not-started');
  });

  it('maps setup to setup', () => {
    expect(mapClassToStage('setup', false)).toBe('setup');
  });

  it.each(['briefing', 'start_time', 'in_progress', 'break', 'offline-scoring'])(
    'maps %s to in-progress',
    (status) => {
      expect(mapClassToStage(status, false)).toBe('in-progress');
    },
  );

  it('maps completed + not finalized to results', () => {
    expect(mapClassToStage('completed', false)).toBe('results');
    expect(mapClassToStage('completed', null)).toBe('results');
  });

  it('maps completed + finalized to closed', () => {
    expect(mapClassToStage('completed', true)).toBe('closed');
  });

  it('maps unknown status to not-started', () => {
    expect(mapClassToStage('unknown-value', false)).toBe('not-started');
  });
});

describe('groupClassesByStage', () => {
  it('groups items into all 5 stages', () => {
    const items = [
      { id: '1', stage: 'not-started' as const },
      { id: '2', stage: 'in-progress' as const },
      { id: '3', stage: 'in-progress' as const },
      { id: '4', stage: 'closed' as const },
    ];
    const grouped = groupClassesByStage(items);

    expect(grouped.get('not-started')!.length).toBe(1);
    expect(grouped.get('setup')!.length).toBe(0);
    expect(grouped.get('in-progress')!.length).toBe(2);
    expect(grouped.get('results')!.length).toBe(0);
    expect(grouped.get('closed')!.length).toBe(1);
  });

  it('returns empty arrays for all stages when input is empty', () => {
    const grouped = groupClassesByStage([]);
    expect(grouped.size).toBe(5);
    for (const arr of grouped.values()) {
      expect(arr.length).toBe(0);
    }
  });
});
