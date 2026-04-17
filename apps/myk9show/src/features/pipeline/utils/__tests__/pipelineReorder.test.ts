import { describe, it, expect } from 'vitest';
import { computePipelineReorder, sortByDisplayOrder } from '../pipelineReorder';
import type { ClassPipelineItem, ClassPipelineStage } from '../../mission-control-types';

function item(
  id: string,
  stage: ClassPipelineStage,
  display_order: number | null,
  overrides: Partial<ClassPipelineItem> = {}
): ClassPipelineItem {
  return {
    id,
    name: `Class ${id}`,
    judge_name: null,
    status: null,
    stage,
    scored_count: 0,
    total_entries: 0,
    is_scoring_finalized: false,
    is_results_reviewed: false,
    start_time: null,
    planned_start_time: null,
    display_order,
    ...overrides,
  };
}

describe('sortByDisplayOrder', () => {
  it('sorts by displayOrder ascending; undefined goes last', () => {
    const sorted = sortByDisplayOrder([
      { id: 'a', displayOrder: 30 },
      { id: 'b', displayOrder: undefined },
      { id: 'c', displayOrder: 10 },
      { id: 'd', displayOrder: 20 },
    ]);
    expect(sorted.map(s => s.id)).toEqual(['c', 'd', 'a', 'b']);
  });

  it('returns a new array without mutating input', () => {
    const input = [
      { id: 'a', displayOrder: 20 },
      { id: 'b', displayOrder: 10 },
    ];
    const sorted = sortByDisplayOrder(input);
    expect(input.map(i => i.id)).toEqual(['a', 'b']);
    expect(sorted.map(i => i.id)).toEqual(['b', 'a']);
  });
});

describe('computePipelineReorder', () => {
  it('returns [] when the active card is not in the list', () => {
    const updates = computePipelineReorder({
      allClasses: [item('a', 'setup', 10)],
      activeId: 'missing',
      overId: 'a',
      targetStage: 'setup',
    });
    expect(updates).toEqual([]);
  });

  it('cross-column move updates status, finalization flag, and display_order', () => {
    const classes = [
      item('a', 'not-started', 10),
      item('b', 'not-started', 20),
      item('c', 'in-progress', 10),
    ];
    const updates = computePipelineReorder({
      allClasses: classes,
      activeId: 'a',
      overId: 'column-in-progress',
      targetStage: 'in-progress',
    });

    const byId = new Map(updates.map(u => [u.classId, u.updates]));

    // Dragged card gets status change + appended position
    expect(byId.get('a')).toEqual({
      displayOrder: 20,
      classStatus: 'in_progress',
    });

    // Source column renumbers: 'b' was 20, should become 10
    expect(byId.get('b')).toEqual({ displayOrder: 10 });

    // Existing target-column card 'c' already at order 10, no update
    expect(byId.has('c')).toBe(false);
  });

  it('moving to results stage sets is_scoring_finalized=false and resets review', () => {
    const classes = [item('a', 'in-progress', 10)];
    const updates = computePipelineReorder({
      allClasses: classes,
      activeId: 'a',
      overId: 'column-results',
      targetStage: 'results',
    });
    const updatesForA = updates.find(u => u.classId === 'a')!.updates;
    expect(updatesForA.classStatus).toBe('completed');
    expect(updatesForA.isScoringFinalized).toBe(false);
    expect(updatesForA.isResultsReviewed).toBe(false);
  });

  it('moving to closed stage sets is_scoring_finalized=true (no review reset)', () => {
    const classes = [item('a', 'results', 10)];
    const updates = computePipelineReorder({
      allClasses: classes,
      activeId: 'a',
      overId: 'column-closed',
      targetStage: 'closed',
    });
    const updatesForA = updates.find(u => u.classId === 'a')!.updates;
    expect(updatesForA.classStatus).toBe('completed');
    expect(updatesForA.isScoringFinalized).toBe(true);
    expect(updatesForA.isResultsReviewed).toBeUndefined();
  });

  it('same-column reorder drops onto another card and renumbers', () => {
    const classes = [item('a', 'setup', 10), item('b', 'setup', 20), item('c', 'setup', 30)];
    // Drop 'c' onto 'a' → new order: c, a, b
    const updates = computePipelineReorder({
      allClasses: classes,
      activeId: 'c',
      overId: 'a',
      targetStage: 'setup',
    });

    const byId = new Map(updates.map(u => [u.classId, u.updates]));
    expect(byId.get('c')).toEqual({ displayOrder: 10 });
    expect(byId.get('a')).toEqual({ displayOrder: 20 });
    expect(byId.get('b')).toEqual({ displayOrder: 30 });
    // No status change on same-column reorder
    for (const u of updates) {
      expect(u.updates.classStatus).toBeUndefined();
    }
  });

  it('dropping onto the same column header at the existing end is a no-op', () => {
    const classes = [item('a', 'setup', 10), item('b', 'setup', 20)];
    // 'b' is already last in 'setup' — dropping on the column header should no-op.
    const updates = computePipelineReorder({
      allClasses: classes,
      activeId: 'b',
      overId: 'column-setup',
      targetStage: 'setup',
    });
    expect(updates).toEqual([]);
  });

  it('dropping onto an empty column sets status but skips unchanged display_order', () => {
    const classes = [item('a', 'not-started', 10)];
    const updates = computePipelineReorder({
      allClasses: classes,
      activeId: 'a',
      overId: 'column-closed',
      targetStage: 'closed',
    });
    const updatesForA = updates.find(u => u.classId === 'a')!.updates;
    // display_order is already 10 (position 1 * step 10) — not re-emitted
    expect(updatesForA.displayOrder).toBeUndefined();
    expect(updatesForA.classStatus).toBe('completed');
    expect(updatesForA.isScoringFinalized).toBe(true);
  });

  it('inserts before the over-card when dropped onto a target card', () => {
    const classes = [
      item('a', 'not-started', 10),
      item('b', 'in-progress', 10),
      item('c', 'in-progress', 20),
    ];
    // Drop 'a' onto 'c' in the in-progress column → order: b, a, c
    const updates = computePipelineReorder({
      allClasses: classes,
      activeId: 'a',
      overId: 'c',
      targetStage: 'in-progress',
    });
    const byId = new Map(updates.map(u => [u.classId, u.updates]));
    // b stays at 10 → no update
    expect(byId.has('b')).toBe(false);
    // a takes position 20
    expect(byId.get('a')?.displayOrder).toBe(20);
    // c shifts from 20 → 30
    expect(byId.get('c')).toEqual({ displayOrder: 30 });
  });
});
