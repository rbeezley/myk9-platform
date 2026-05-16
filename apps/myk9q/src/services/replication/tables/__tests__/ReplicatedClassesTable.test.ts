/**
 * ReplicatedClassesTable Tests
 *
 * Regression coverage for the cross-app run-order propagation bug.
 *
 * Background: myK9Show's RunOrderPage writes `display_order` to the `classes`
 * table (canonical column, migration 136). myK9Q historically sorted by
 * `class_order` only — a legacy alias that exists on `view_class_summary` but
 * not on the `classes` row itself. The mismatch silently dropped secretary-side
 * reorders on the floor at ringside.
 *
 * These tests pin the precedence so the bug can't regress:
 *   1. `display_order` wins when both are set.
 *   2. `class_order` is the fallback when `display_order` is absent.
 *   3. Fully unordered rows sink to the end, not to position 0.
 */

import {
  ReplicatedClassesTable,
  getClassSortKey,
  type Class,
} from '../ReplicatedClassesTable';
import { deleteDB } from 'idb';
import './setup'; // real IndexedDB + supabase mock + logger mock

const TEST_DB_NAME = 'myK9_Replication';

function makeClass(overrides: Partial<Class> = {}): Class {
  return {
    id: 'class-1',
    trial_id: 1,
    element: 'Container',
    level: 'Novice',
    ...overrides,
  };
}

describe('getClassSortKey', () => {
  it('prefers display_order over class_order', () => {
    expect(
      getClassSortKey({ display_order: 10, class_order: 999 })
    ).toBe(10);
  });

  it('falls back to class_order when display_order is missing', () => {
    expect(getClassSortKey({ class_order: 7 })).toBe(7);
  });

  it('falls back to class_order when display_order is undefined', () => {
    expect(
      getClassSortKey({ display_order: undefined, class_order: 7 })
    ).toBe(7);
  });

  it('treats display_order=0 as a real value (not falsy)', () => {
    // The previous implementation used `cls.class_order || 0` which would
    // incorrectly treat 0 as "no order". Verify the new key respects it.
    expect(getClassSortKey({ display_order: 0, class_order: 99 })).toBe(0);
  });

  it('returns MAX_SAFE_INTEGER when neither key is set (sinks to end)', () => {
    expect(getClassSortKey({})).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('ReplicatedClassesTable.getByElement', () => {
  // getByElement uses the same display_order precedence as getByTrialId but
  // operates on getAll() rather than the indexed query, so it can be exercised
  // against fake-indexeddb without registering trial_id as an index.
  let table: ReplicatedClassesTable;

  beforeEach(async () => {
    await deleteDB(TEST_DB_NAME);
    table = new ReplicatedClassesTable();
  });

  afterEach(async () => {
    await deleteDB(TEST_DB_NAME);
  });

  it('sorts by display_order ascending — propagates secretary reorders', async () => {
    // Simulate a secretary reorder in myK9Show: the canonical column now puts
    // class-c first, then class-a, then class-b. `class_order` is unset
    // because it only exists on the legacy view.
    const a = makeClass({ id: 'class-a', element: 'Container', display_order: 20 });
    const b = makeClass({ id: 'class-b', element: 'Container', display_order: 30 });
    const c = makeClass({ id: 'class-c', element: 'Container', display_order: 10 });

    await table.set(a.id, a, false);
    await table.set(b.id, b, false);
    await table.set(c.id, c, false);

    const result = await table.getByElement('Container');

    expect(result.map(r => r.id)).toEqual(['class-c', 'class-a', 'class-b']);
  });

  it('honors display_order even when stale class_order disagrees', async () => {
    // Defensive case: if a class row somehow carries both columns (e.g. mixed
    // sources), display_order is the source of truth. A reorder must not be
    // overridden by a leftover class_order.
    const a = makeClass({
      id: 'class-a',
      element: 'Container',
      display_order: 30,
      class_order: 10,
    });
    const b = makeClass({
      id: 'class-b',
      element: 'Container',
      display_order: 10,
      class_order: 30,
    });

    await table.set(a.id, a, false);
    await table.set(b.id, b, false);

    const result = await table.getByElement('Container');

    // display_order wins: class-b (10) before class-a (30)
    expect(result.map(r => r.id)).toEqual(['class-b', 'class-a']);
  });

  it('places classes without any order at the end', async () => {
    const ordered = makeClass({ id: 'ordered', element: 'Container', display_order: 5 });
    const unordered = makeClass({ id: 'unordered', element: 'Container' });

    await table.set(ordered.id, ordered, false);
    await table.set(unordered.id, unordered, false);

    const result = await table.getByElement('Container');

    expect(result.map(r => r.id)).toEqual(['ordered', 'unordered']);
  });
});
