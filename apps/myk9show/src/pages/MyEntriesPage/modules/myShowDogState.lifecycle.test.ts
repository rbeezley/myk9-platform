/**
 * MYK9-582 — the lifecycle half of `deriveClassRowState`.
 *
 * Split out of `myShowDogState.test.ts` so both files stay under the 500-line
 * limit. Fixtures go through the real `groupEntriesByOrder` →
 * `groupEntriesByShow` pipeline, the same as every other row test; none of
 * these cases reaches the day math, because a settled lifecycle returns first.
 */
import { describe, it, expect } from 'vitest';
import { EntryStatus } from '@/types/show-registration-types';
import { makeClass, makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import { groupEntriesByShow, indexOrdersById, type MyShowClass } from './groupEntriesByShow';
import { deriveClassRowState } from './myShowDogState';
import type { EntryClass } from './my-entries-types';

/** One dog, one class, through the production grouping. */
function stateOf(cls: Partial<EntryClass>) {
  const rows = [makeRow({ id: 'e1', registrationId: 'r1', classes: [makeClass(cls)] })];
  const [group] = groupEntriesByShow(toOrders(rows));
  const dog = group!.dogs[0]!;
  return deriveClassRowState(dog.classes[0] as MyShowClass, {
    now: NOW,
    ordersById: indexOrdersById(group!),
    isPastShow: false,
  });
}

// MYK9-582. Each case sets exactly ONE of the two fields `lifecycleStatus`
// reads, so neither half of that fallback can be deleted while these pass.
describe('settled by lifecycle', () => {
  it('reads withdrawn from the canonical entryStatus alone', () => {
    expect(stateOf({ entryStatus: EntryStatus.CANCELLED, status: 'entered' })).toEqual({
      kind: 'withdrawn',
    });
  });

  it('reads withdrawn from a scratched entryStatus alone', () => {
    expect(stateOf({ entryStatus: EntryStatus.SCRATCHED, status: 'entered' })).toEqual({
      kind: 'withdrawn',
    });
  });

  it('falls back to the participation value when entryStatus is absent', () => {
    expect(stateOf({ entryStatus: undefined, status: 'scratched' })).toEqual({ kind: 'withdrawn' });
  });

  // `entryAccounting` normalises the values it owns, so only the two
  // statuses this module adds on top need their own proof of trimming and
  // case-folding.
  it('tolerates a padded, upper-case lifecycle value', () => {
    expect(stateOf({ entryStatus: ' Moved ' as EntryStatus, status: 'entered' })).toEqual({
      kind: 'moved',
    });
  });

  it('tolerates a padded, upper-case not-accepted value', () => {
    expect(stateOf({ entryStatus: ' Not_Accepted ' as EntryStatus, status: 'entered' })).toEqual({
      kind: 'not-accepted',
    });
  });

  it('reads a move-up source row as moved, not withdrawn', () => {
    expect(stateOf({ entryStatus: EntryStatus.MOVED, status: 'entered' })).toEqual({
      kind: 'moved',
    });
  });

  it('reads a not-accepted row as not-accepted, not withdrawn', () => {
    expect(stateOf({ entryStatus: EntryStatus.REJECTED, status: 'entered' })).toEqual({
      kind: 'not-accepted',
    });
  });

  it('reads an absent lifecycle value as the absent row, not a withdrawal', () => {
    expect(stateOf({ entryStatus: undefined, status: 'absent' })).toEqual({ kind: 'absent' });
  });

  // Deliberate precedence: a row withdrawn on paper but marked absent or
  // excused in the ring has a recorded OUTCOME, and that outranks the
  // lifecycle so `ResultBadge` can name it.
  it('lets a recorded absence outrank the withdrawal', () => {
    expect(
      stateOf({
        entryStatus: EntryStatus.CANCELLED,
        status: 'scratched',
        resultStatus: 'absent',
      })
    ).toEqual({ kind: 'absent' });
  });
});
