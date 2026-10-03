import { describe, expect, it } from 'vitest';
import {
  canMarkClassComplete,
  canMarkEntryCheckedIn,
  canMoveUpEntry,
  getEntrySourceId,
  isSyntheticDisplayActionNode,
  sourceIdFromNodeId,
} from '../showMapActionHelpers';
import type { ShowMapNode, ShowMapTree } from '../showMapTypes';

function makeNode(overrides: Partial<ShowMapNode> & Pick<ShowMapNode, 'id' | 'type'>): ShowMapNode {
  return {
    label: overrides.id,
    childrenCount: 0,
    ...overrides,
  };
}

describe('showMapActionHelpers', () => {
  it('treats synthetic display nodes as actionless', () => {
    expect(
      isSyntheticDisplayActionNode(
        makeNode({ id: 'all-exhibitors:show-1', type: 'all-exhibitors' })
      )
    ).toBe(true);
    expect(isSyntheticDisplayActionNode(makeNode({ id: 'dog:dog-1', type: 'dog' }))).toBe(true);
    expect(isSyntheticDisplayActionNode(makeNode({ id: 'more:class-1', type: 'more' }))).toBe(true);
    expect(isSyntheticDisplayActionNode(makeNode({ id: 'class:class-1', type: 'class' }))).toBe(
      false
    );
  });

  it('extracts source ids only for matching non-empty node id prefixes', () => {
    expect(sourceIdFromNodeId('entry:entry-1', 'entry')).toBe('entry-1');
    expect(sourceIdFromNodeId('class:class-1', 'entry')).toBeUndefined();
    expect(sourceIdFromNodeId('dog-entry:entry-1', 'entry')).toBeUndefined();
    expect(sourceIdFromNodeId('entry:', 'entry')).toBeUndefined();
    expect(sourceIdFromNodeId(undefined, 'entry')).toBeUndefined();
  });

  it('extracts entry source ids from entry and dog-entry nodes', () => {
    expect(getEntrySourceId(makeNode({ id: 'entry:entry-1', type: 'entry' }))).toBe('entry-1');
    expect(getEntrySourceId(makeNode({ id: 'dog-entry:entry-2', type: 'dog-entry' }))).toBe(
      'entry-2'
    );
  });

  it('allows active empty and complete-progress classes to be marked complete', () => {
    expect(
      canMarkClassComplete(
        makeNode({
          id: 'class:empty',
          type: 'class',
          status: { value: 'in-progress', label: 'In progress', kind: 'active' },
        })
      )
    ).toBe(true);

    expect(
      canMarkClassComplete(
        makeNode({
          id: 'class:complete',
          type: 'class',
          status: { value: 'in-progress', label: 'In progress', kind: 'active' },
          progress: { completed: 4, total: 4, label: '4/4 scored' },
        })
      )
    ).toBe(true);

    expect(
      canMarkClassComplete(
        makeNode({
          id: 'class:incomplete',
          type: 'class',
          status: { value: 'in-progress', label: 'In progress', kind: 'active' },
          progress: { completed: 3, total: 4, label: '3/4 scored' },
        })
      )
    ).toBe(false);
  });

  it('rejects checked-in actions for complete, muted, checked-in, completed, or pulled entries', () => {
    expect(canMarkEntryCheckedIn(makeNode({ id: 'entry:ready', type: 'entry' }))).toBe(true);
    expect(
      canMarkEntryCheckedIn(
        makeNode({
          id: 'entry:complete-status',
          type: 'entry',
          status: { value: 'complete', label: 'Complete', kind: 'complete' },
        })
      )
    ).toBe(false);
    expect(
      canMarkEntryCheckedIn(
        makeNode({
          id: 'entry:muted-status',
          type: 'entry',
          status: { value: 'scratched', label: 'Scratched', kind: 'muted' },
        })
      )
    ).toBe(false);

    for (const value of ['checked-in', 'completed', 'pulled']) {
      expect(
        canMarkEntryCheckedIn(
          makeNode({
            id: `entry:${value}`,
            type: 'entry',
            checkInStatus: { value, label: value, kind: 'active' },
          })
        )
      ).toBe(false);
    }
  });

  it('MYK9-825: rejects Move up for a moved (or otherwise muted) entry, allows it for an ordinary one', () => {
    const notStarted = makeNode({
      id: 'class:c',
      type: 'class',
      status: { value: 'scheduled', label: 'Not started', kind: 'neutral' },
    });
    const tree = { nodesById: { 'class:c': notStarted } } as unknown as ShowMapTree;
    expect(
      canMoveUpEntry(makeNode({ id: 'entry:ready', type: 'entry', parentId: 'class:c' }), tree)
    ).toBe(true);
    expect(
      canMoveUpEntry(
        makeNode({
          id: 'entry:moved',
          type: 'entry',
          parentId: 'class:c',
          status: { value: 'moved', label: 'Moved', kind: 'muted' },
        }),
        tree
      )
    ).toBe(false);
    expect(canMoveUpEntry(makeNode({ id: 'class:not-an-entry', type: 'class' }), tree)).toBe(false);
  });

  it('offers Move up only before the dog runs, in a class that has not started (owner, 2026-10-03)', () => {
    const classNode = (kind: 'neutral' | 'active' | 'complete') =>
      ({
        nodesById: {
          'class:c': makeNode({
            id: 'class:c',
            type: 'class',
            status: { value: kind, label: kind, kind },
          }),
        },
      }) as unknown as ShowMapTree;
    const entry = (kind?: 'complete' | 'active') =>
      makeNode({
        id: 'entry:e',
        type: 'entry',
        parentId: 'class:c',
        ...(kind && { status: { value: kind, label: kind, kind } }),
      });

    expect(canMoveUpEntry(entry(), classNode('active'))).toBe(false);
    expect(canMoveUpEntry(entry(), classNode('complete'))).toBe(false);
    expect(canMoveUpEntry(entry('complete'), classNode('neutral'))).toBe(false);
    expect(canMoveUpEntry(entry('active'), classNode('neutral'))).toBe(false);
    expect(canMoveUpEntry(entry(), classNode('neutral'))).toBe(true);
  });
});
