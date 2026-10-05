// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { pendingByRunOrder as ringsidePending } from '../../../packages/ringside/src/pages/EntryList/runQueue';
import { pendingByRunOrder, type ProximityEntryRow } from './runProximity';

/**
 * MYK9-995: the push and the screen must name the same next dog. Run order is
 * not unique per class, so ties are real; both queues are run over the same
 * rows, in several input orders, and must agree on the order.
 */

function row(
  id: string,
  armband: string | number | null,
  runOrder: number | null,
  checkIn = 'checked-in'
): ProximityEntryRow {
  // `entries.armband` is TEXT: the live select hands the function strings.
  return {
    id,
    dog_id: `dog-${id}`,
    armband: armband as number | null,
    run_order: runOrder,
    is_scored: false,
    check_in_status: checkIn,
  };
}

/** The ringside view of the same row (armband parsed like replicatedRunQueue). */
function ringside(rows: ProximityEntryRow[]): string[] {
  return ringsidePending(
    rows.map(r => {
      const parsed = Number.parseInt(String(r.armband ?? ''), 10);
      return {
        id: r.id,
        armband: Number.isNaN(parsed) ? 0 : parsed,
        exhibitorOrder: r.run_order,
        isScored: r.is_scored ?? false,
        status: r.check_in_status ?? 'no-status',
      };
    })
  ).map(e => e.id);
}

const fixture: ProximityEntryRow[] = [
  // Tie on run order 4: armband 9 arrives first, armband 3 must still lead.
  row('00000000-0000-0000-0000-0000000000c9', '9', 4),
  row('00000000-0000-0000-0000-0000000000c3', '3', 4),
  // Tie on run order AND armband: id decides.
  row('00000000-0000-0000-0000-0000000000b2', '7', 2),
  row('00000000-0000-0000-0000-0000000000b1', '7', 2),
  // Armband fallback tie: run order 5 vs an unordered dog wearing armband 5.
  row('00000000-0000-0000-0000-0000000000a5', '40', 5),
  row('00000000-0000-0000-0000-0000000000a0', '5', null),
  // Untied rows, and the in-ring dog (excluded on both sides).
  row('00000000-0000-0000-0000-0000000000d1', '11', 1),
  row('00000000-0000-0000-0000-0000000000e1', '12', 9, 'in-ring'),
];

const expectedOrder = [
  '00000000-0000-0000-0000-0000000000d1',
  '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000b2',
  '00000000-0000-0000-0000-0000000000c3',
  '00000000-0000-0000-0000-0000000000c9',
  '00000000-0000-0000-0000-0000000000a0',
  '00000000-0000-0000-0000-0000000000a5',
];

describe('push proximity queue order matches the ringside queue on ties', () => {
  const inputOrders: [string, ProximityEntryRow[]][] = [
    ['as listed', fixture],
    ['reversed', [...fixture].reverse()],
  ];

  for (const [label, rows] of inputOrders) {
    it(`agrees with ringside (${label})`, () => {
      const push = pendingByRunOrder(rows).map(p => p.entryId);
      expect(push).toEqual(ringside(rows));
      // Absolute anchor, so a mistake shared by both sides cannot pass.
      expect(push).toEqual(expectedOrder);
    });
  }

  it('counts dogs ahead from that order', () => {
    const pending = pendingByRunOrder([...fixture].reverse());
    expect(pending.map(p => p.dogsAhead)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
