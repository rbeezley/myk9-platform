/**
 * MYK9-1914: a drag in a partly scored class must not write duplicate run orders.
 * Drag mode lists only the pending dogs; scored dogs keep their slots.
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useDragAndDropEntries } from './useDragAndDropEntries';
import type { Entry } from '../../../stores/entryStore';

vi.mock('@myk9/core', async () => {
  const actual = await vi.importActual<typeof import('@myk9/core')>('@myk9/core');
  return {
    ...actual,
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
  };
});

function dog(id: string, exhibitorOrder: number, isScored = false): Entry {
  return {
    id,
    armband: Number(id.replace(/\D/g, '')) || 0,
    callName: id,
    breed: '',
    handler: '',
    isScored,
    status: isScored ? 'completed' : 'no-status',
    classId: '1',
    className: 'Container Novice A',
    inRing: false,
    exhibitorOrder,
  } as Entry;
}

async function drag(
  localEntries: Entry[],
  dragged: Entry[],
  activeId: string,
  overId: string
): Promise<{ updater: ReturnType<typeof vi.fn>; setLocalEntries: ReturnType<typeof vi.fn> }> {
  const updater = vi.fn().mockResolvedValue(undefined);
  const setLocalEntries = vi.fn();
  const { result } = renderHook(() =>
    useDragAndDropEntries({
      localEntries,
      setLocalEntries,
      currentEntries: dragged,
      updateExhibitorOrder: updater,
    })
  );
  act(() => {
    result.current.handleDragStart({ active: { id: activeId } } as unknown as DragStartEvent);
  });
  await act(async () => {
    await result.current.handleDragEnd({
      active: { id: activeId },
      over: { id: overId },
    } as unknown as DragEndEvent);
  });
  return { updater, setLocalEntries };
}

const orders = (entries: Entry[]) => entries.map(e => [e.id, e.exhibitorOrder]);

describe('drag in a partly scored class (MYK9-1914)', () => {
  it('permutes pending dogs among their own slots and never touches scored dogs', async () => {
    const wren = dog('wren', 1);
    const scout = dog('scout', 2, true);
    const willow = dog('willow', 3, true);
    const cooper = dog('cooper', 4);
    const quill = dog('quill', 5);
    const { updater, setLocalEntries } = await drag(
      [wren, scout, willow, cooper, quill],
      [wren, cooper, quill],
      'quill',
      'wren'
    );

    const [written, previous] = updater.mock.calls[0] as [Entry[], Entry[]];
    expect(orders(written)).toEqual([
      ['quill', 1],
      ['wren', 4],
      ['cooper', 5],
    ]);
    expect(previous.map(e => e.id)).toEqual(['wren', 'cooper', 'quill']);

    const all = setLocalEntries.mock.calls[0][0] as Entry[];
    expect(all.find(e => e.id === 'scout')?.exhibitorOrder).toBe(2);
    expect(all.find(e => e.id === 'willow')?.exhibitorOrder).toBe(3);
    const values = all.map(e => e.exhibitorOrder);
    expect(new Set(values).size).toBe(values.length);
  });

  it('heals the whole class when the pending dogs share a slot with a scored dog', async () => {
    // Existing damage: Wren and Scout both at 2, Cooper and Willow both at 3.
    const quill = dog('quill', 1);
    const wren = dog('wren', 2);
    const scout = dog('scout', 2, true);
    const cooper = dog('cooper', 3);
    const willow = dog('willow', 3, true);
    const { updater, setLocalEntries } = await drag(
      [quill, wren, scout, cooper, willow],
      [quill, wren, cooper],
      'cooper',
      'quill'
    );

    const [written] = updater.mock.calls[0] as [Entry[], Entry[]];
    const values = written.map(e => e.exhibitorOrder);
    expect(values.slice().sort()).toEqual([1, 2, 3, 4, 5]);
    // Cooper is now first of the pending dogs, and scored dogs kept their positions in the order.
    const byId = new Map(written.map(e => [e.id, e.exhibitorOrder as number]));
    expect(byId.get('cooper') as number).toBeLessThan(byId.get('quill') as number);
    expect(byId.get('quill') as number).toBeLessThan(byId.get('wren') as number);
    const all = setLocalEntries.mock.calls[0][0] as Entry[];
    expect(new Set(all.map(e => e.exhibitorOrder)).size).toBe(5);
  });

  it('heals when a pending dog has no stored run order', async () => {
    const a = dog('a1', 0);
    const b = dog('b2', 0);
    const s = dog('s3', 2, true);
    const { updater } = await drag([a, b, s], [a, b], 'b2', 'a1');
    const [written] = updater.mock.calls[0] as [Entry[], Entry[]];
    expect(written.map(e => e.exhibitorOrder).sort()).toEqual([1, 2, 3]);
  });

  it('renumbers 1..N when the whole class is dragged (nothing hidden)', async () => {
    const a = dog('a', 2);
    const b = dog('b', 4);
    const c = dog('c', 9);
    const { updater } = await drag([a, b, c], [a, b, c], 'c', 'a');
    const [written] = updater.mock.calls[0] as [Entry[], Entry[]];
    expect(orders(written)).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ]);
  });

  it('numbers a combined A/B queue as one ring order', async () => {
    const a1 = { ...dog('a1', 1), section: 'A' } as Entry;
    const b1 = { ...dog('b1', 2), section: 'B' } as Entry;
    const a2 = { ...dog('a2', 3, true), section: 'A' } as Entry;
    const b2 = { ...dog('b2', 4), section: 'B' } as Entry;
    const { updater } = await drag([a1, b1, a2, b2], [a1, b1, b2], 'b2', 'a1');
    const [written] = updater.mock.calls[0] as [Entry[], Entry[]];
    expect(orders(written)).toEqual([
      ['b2', 1],
      ['a1', 2],
      ['b1', 4],
    ]);
  });
});
