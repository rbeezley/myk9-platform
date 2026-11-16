import { describe, expect, it } from 'vitest';

import { isCancelledClassStatus } from './ringsideClassStatusMap';
import { toClassEntry } from './atShowClassListAdapter';
import type { ReplicatedClass } from '@/services/replication';

function project(classStatus: string) {
  return toClassEntry(
    { id: 'class-1', name: 'Container Novice', classStatus } satisfies ReplicatedClass,
    [],
    new Set()
  );
}

describe('at-show class list unset judge (MYK9-1853)', () => {
  it('reads null, blank and the legacy TBD as one No Judge Assigned, and keeps a real name', () => {
    for (const judgeName of [undefined, '', 'TBD']) {
      const row = toClassEntry({ id: 'c', name: 'Container', judgeName }, [], new Set());
      expect(row.judge_name).toBe('No Judge Assigned');
    }
    expect(
      toClassEntry({ id: 'c', name: 'C', judgeName: 'Pat Lee' }, [], new Set()).judge_name
    ).toBe('Pat Lee');
  });
});

describe('at-show class list: cancelled (MYK9-1847)', () => {
  it('carries a cancelled class as its own fact, keeping the ringside status unchanged', () => {
    const result = project('cancelled');
    expect(result.is_cancelled).toBe(true);
    expect(result.class_status).toBe('no-status');
  });

  it('does not mark any other class as cancelled', () => {
    for (const status of ['upcoming', 'in_progress', 'completed', 'setup']) {
      expect(project(status).is_cancelled).toBeUndefined();
    }
  });

  it('recognises the status spellings the ringside map folds', () => {
    expect(isCancelledClassStatus('Cancelled')).toBe(true);
    expect(isCancelledClassStatus('in_progress')).toBe(false);
    expect(isCancelledClassStatus(undefined)).toBe(false);
  });
});

describe('at-show class list: scored on paper (MYK9-1970)', () => {
  it('carries the replicated paper fact to the class row, and an explicit phone choice, never a null that follows the show', () => {
    const row = (scoresOnPaper: boolean | null | undefined) =>
      toClassEntry({ id: 'c', name: 'C', scoresOnPaper }, [], new Set());
    expect(row(true).scores_on_paper).toBe(true);
    expect(row(false).scores_on_paper).toBe(false);
    expect(row(null).scores_on_paper).toBeUndefined();
    expect(row(undefined).scores_on_paper).toBeUndefined();
  });
});
