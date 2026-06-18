import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBulkSelection } from '../useBulkSelection';

interface Row {
  id: string;
}

const getId = (r: Row) => r.id;

describe('useBulkSelection', () => {
  it('toggles individual items and tracks selectedItems', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    const { result } = renderHook(() => useBulkSelection({ items, getItemId: getId }));

    act(() => result.current.toggleItem(items[0]!));
    expect(result.current.selectedCount).toBe(1);
    expect(result.current.selectedItems.map(getId)).toEqual(['a']);
  });

  it('without pruneToItems, a selection resurfaces when the item returns to the list', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    const { result, rerender } = renderHook(
      ({ items }) => useBulkSelection({ items, getItemId: getId }),
      { initialProps: { items: [a, b] } }
    );

    act(() => result.current.toggleItem(a));
    expect(result.current.selectedCount).toBe(1);

    // 'a' filtered out — still retained in the underlying id set
    rerender({ items: [b] });
    expect(result.current.selectedCount).toBe(1);

    // filter removed — 'a' resurfaces as selected (the bug pruneToItems fixes)
    rerender({ items: [a, b] });
    expect(result.current.selectedItems.map(getId)).toEqual(['a']);
  });

  it('with pruneToItems, a filtered-out selection is dropped and does not resurface', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    const { result, rerender } = renderHook(
      ({ items }) => useBulkSelection({ items, getItemId: getId, pruneToItems: true }),
      { initialProps: { items: [a, b] } }
    );

    act(() => result.current.toggleItem(a));
    expect(result.current.selectedCount).toBe(1);

    // 'a' filtered out — pruned from the id set during render
    rerender({ items: [b] });
    expect(result.current.selectedCount).toBe(0);

    // filter removed — 'a' must NOT come back selected
    rerender({ items: [a, b] });
    expect(result.current.selectedItems).toEqual([]);
    expect(result.current.selectedCount).toBe(0);
  });

  it('with pruneToItems, still-present selections survive an unrelated filter change', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    const c = { id: 'c' };
    const { result, rerender } = renderHook(
      ({ items }) => useBulkSelection({ items, getItemId: getId, pruneToItems: true }),
      { initialProps: { items: [a, b, c] } }
    );

    act(() => result.current.toggleItem(a));
    // 'c' filtered out but 'a' stays present → 'a' selection survives
    rerender({ items: [a, b] });
    expect(result.current.selectedItems.map(getId)).toEqual(['a']);
  });
});
