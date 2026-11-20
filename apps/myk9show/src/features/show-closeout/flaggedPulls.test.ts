import { describe, expect, it } from 'vitest';
import { collectFlaggedPulls, type FlaggedPullEntry } from './flaggedPulls';

const flag = (overrides: Partial<FlaggedPullEntry> = {}): FlaggedPullEntry => ({
  id: 'flag-1',
  dog_id: 'dog-1',
  armband: '101',
  entry_status: 'confirmed',
  check_in_status: 'pulled',
  is_scored: false,
  dog: { name: 'Biscuit', call_name: null },
  class: { name: 'Novice Container' },
  ...overrides,
});

describe('collectFlaggedPulls (MYK9-2145, MYK9-2180)', () => {
  it('counts a dog flagged in two classes once, and lists both entries', () => {
    const list = collectFlaggedPulls([flag(), flag({ id: 'flag-2' })]);

    expect(list.dogCount).toBe(1);
    expect(list.items.map(item => item.entryId)).toEqual(['flag-1', 'flag-2']);
    expect(list.classRemoved).toEqual([]);
  });

  it('does not list a flag the desk already confirmed into a Pull', () => {
    expect(collectFlaggedPulls([flag({ entry_status: 'scratched' })]).dogCount).toBe(0);
  });

  // Only a flag the Check-in desk offers Confirm on (deskStatusEditableFor) is listed.
  it.each([
    ['scored', { is_scored: true }],
    ['completed', { entry_status: 'completed' }],
    ['declined', { entry_status: 'not_accepted' }],
    ['cancelled', { entry_status: 'cancelled' }],
    ['promoted from the waitlist, unpaid', { entry_status: 'pending-payment' }],
    ['pending', { entry_status: 'submitted' }],
  ] as const)('does not list a flag on a %s entry the desk cannot confirm', (_label, fields) => {
    expect(collectFlaggedPulls([flag(fields)])).toEqual({
      dogCount: 0,
      items: [],
      classRemoved: [],
    });
  });

  it('keeps a flag whose class row is missing, in the "Class removed" group', () => {
    const list = collectFlaggedPulls([
      flag({ id: 'kept', class: null, dog: { name: 'Biscuit', call_name: 'Bis' } }),
      flag({ id: 'other', dog_id: 'dog-2' }),
    ]);

    expect(list.dogCount).toBe(2);
    expect(list.classRemoved).toEqual([
      { entryId: 'kept', dogName: 'Bis', armband: '101', classRemoved: true },
    ]);
  });
});
