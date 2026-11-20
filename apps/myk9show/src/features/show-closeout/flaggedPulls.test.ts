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
  class_id: 'class-1',
  trial_id: 'trial-1',
  class: { name: 'Novice Container' },
  ...overrides,
});

describe('collectFlaggedPulls (MYK9-2145, MYK9-2180)', () => {
  it('counts a dog flagged in two classes once, and lists both entries', () => {
    const list = collectFlaggedPulls([flag(), flag({ id: 'flag-2' })]);

    expect(list.dogCount).toBe(1);
    expect(list.items.map(item => item.entryId)).toEqual(['flag-1', 'flag-2']);
    expect(list.offDesk).toEqual([]);
    expect(list.deskResolvable).toBe(true);
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
      offDesk: [],
      deskResolvable: false,
    });
  });

  // MYK9-2180: no joined class is never dropped. Removed only when the confirmed schedule says so.
  it('keeps a flag with no joined class off the desk, "removed" only when the schedule says so', () => {
    const entries = [
      flag({ id: 'entry-gone11', class_id: 'gone', class: null }),
      flag({
        id: 'entry-kept22',
        class_id: 'kept',
        class: null,
        dog: { name: 'B', call_name: 'Bis' },
      }),
      flag({ id: 'other', dog_id: 'dog-2' }),
    ];
    const schedule = {
      'trial-1': [{ id: 'kept', element: 'Container', level: 'Novice', section: 'A' }],
    };

    const list = collectFlaggedPulls(entries, schedule);
    expect(list.dogCount).toBe(2);
    expect(list.deskResolvable).toBe(true);
    expect(list.offDesk).toEqual([
      {
        entryId: 'entry-gone11',
        dogName: 'Biscuit',
        armband: '101',
        classState: 'removed',
        classLabel: null,
        place: 'entry GONE11',
      },
      {
        entryId: 'entry-kept22',
        dogName: 'Bis',
        armband: '101',
        classState: 'unavailable',
        classLabel: 'Container Novice A',
        place: 'Container Novice A',
      },
    ]);

    // An unconfirmed schedule verifies nothing: every one is "unavailable", none "removed".
    expect(collectFlaggedPulls(entries, null).offDesk.map(item => item.classState)).toEqual([
      'unavailable',
      'unavailable',
    ]);
  });
});
