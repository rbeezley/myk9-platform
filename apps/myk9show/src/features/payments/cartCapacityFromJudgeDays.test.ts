import { describe, expect, it } from 'vitest';
import {
  cartCapacityFromJudgeDays,
  type ClassJudgeDayAvailabilityRow,
} from './cartCapacityFromJudgeDays';
import { splitCartItemsByJudgeDayCapacity } from './cartCapacitySplit';
import type { CartItemWithDetails } from '@/store/cartStore';

function row(overrides: Partial<ClassJudgeDayAvailabilityRow>): ClassJudgeDayAvailabilityRow {
  return {
    class_id: 'interior',
    class_max_entries: null,
    class_entry_count: 0,
    class_remaining: null,
    class_full: false,
    allow_waitlist: false,
    self_service_block: null,
    judge_id: null,
    show_date: null,
    day_capacity: null,
    day_taken: null,
    day_mail_in_reserved: null,
    day_remaining: null,
    ...overrides,
  };
}

function line(id: string, classId: string): CartItemWithDetails {
  return {
    id,
    cart_id: 'cart-1',
    class_id: classId,
    dog_id: `dog-${id}`,
    handler_id: null,
    entry_fee_cents: 3000,
    jump_height: null,
    special_requests: null,
    created_at: '2026-09-25T00:00:00.000Z',
    class: { id: classId, name: classId, level: null, trial_id: 'trial-1', allow_waitlist: false },
  };
}

// The server's rows for the SQL test's fixture: Interior is judged by Alma
// (full) and Bert (3 left); Exterior by Bert alone; Buried has no judge and
// one class spot left.
const serverRows: ClassJudgeDayAvailabilityRow[] = [
  row({
    class_id: 'interior',
    judge_id: 'alma',
    show_date: '2026-10-10',
    day_remaining: 0,
    self_service_block: 'full',
  }),
  row({
    class_id: 'interior',
    judge_id: 'bert',
    show_date: '2026-10-10',
    day_remaining: 3,
    self_service_block: 'full',
  }),
  row({ class_id: 'exterior', judge_id: 'bert', show_date: '2026-10-10', day_remaining: 3 }),
  row({ class_id: 'buried', class_max_entries: 2, class_entry_count: 1, class_remaining: 1 }),
];

describe('cartCapacityFromJudgeDays', () => {
  it('keeps every judge day of a two-judge class, with its own remaining spots', () => {
    const facts = cartCapacityFromJudgeDays(serverRows);

    expect(facts.judgeDays).toEqual([
      { judgeId: 'alma', showDate: '2026-10-10', availableSpots: 0, classIds: ['interior'] },
      {
        judgeId: 'bert',
        showDate: '2026-10-10',
        availableSpots: 3,
        classIds: ['interior', 'exterior'],
      },
    ]);
    expect(facts.classSpots).toEqual([{ classId: 'buried', availableSpots: 1 }]);
  });

  it('reads a class the server calls full as having no spots', () => {
    const facts = cartCapacityFromJudgeDays([
      row({ class_id: 'buried', class_max_entries: 2, class_remaining: 1, class_full: true }),
    ]);
    expect(facts.classSpots).toEqual([{ classId: 'buried', availableSpots: 0 }]);
  });

  it("blocks the two-judge class on Alma's day but still pays Bert's single-judge class", () => {
    const facts = cartCapacityFromJudgeDays(serverRows);
    const decision = splitCartItemsByJudgeDayCapacity(
      [line('interior-line', 'interior'), line('exterior-line', 'exterior')],
      facts.judgeDays,
      facts.classSpots
    );

    expect(decision.blockedItems.map(item => item.id)).toEqual(['interior-line']);
    expect(decision.fullReasonByItemId.get('interior-line')).toEqual({
      kind: 'judge-day',
      judgeId: 'alma',
      showDate: '2026-10-10',
    });
    expect(decision.confirmedItemIds).toEqual(new Set(['exterior-line']));
  });

  // The old read named only each class's tightest day (Alma's). With that
  // shape Bert's day never lists Interior, so an Interior line would not use
  // one of Bert's spots and a cart could overfill his day.
  it("charges an Interior line against Bert's day too", () => {
    const facts = cartCapacityFromJudgeDays(
      serverRows.map(r => (r.judge_id === 'alma' ? { ...r, day_remaining: 5 } : r))
    );
    const bertOneLeft = facts.judgeDays.map(d =>
      d.judgeId === 'bert' ? { ...d, availableSpots: 1 } : d
    );
    const decision = splitCartItemsByJudgeDayCapacity(
      [line('interior-line', 'interior'), line('exterior-line', 'exterior')],
      bertOneLeft,
      facts.classSpots
    );

    expect(decision.confirmedItemIds).toEqual(new Set(['interior-line']));
    expect(decision.blockedItems.map(item => item.id)).toEqual(['exterior-line']);
  });
});
