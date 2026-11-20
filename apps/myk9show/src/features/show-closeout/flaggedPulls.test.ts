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
  trial: { trial_date: '2026-11-21', trial_number: '1' },
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

  // MYK9-2180: no joined class is never dropped, and every flag names its trial day and entry.
  it('keeps a flag with no joined class off the desk, named by trial day and entry', () => {
    const entries = [
      flag({ id: 'entry-sat111', class: null }),
      flag({
        id: 'entry-sun222',
        class: null,
        trial: { trial_date: '2026-11-22', trial_number: '2' },
      }),
      flag({ id: 'entry-none33', dog_id: 'dog-2', class: null, trial: null }),
      flag({ id: 'other', dog_id: 'dog-3' }),
    ];

    const list = collectFlaggedPulls(entries);
    expect(list.dogCount).toBe(3);
    expect(list.deskResolvable).toBe(true);
    expect(list.offDesk).toEqual([
      {
        entryId: 'entry-sat111',
        dogName: 'Biscuit',
        armband: '101',
        onDesk: false,
        place: 'Sat Nov 21, Trial 1, entry SAT111',
      },
      {
        entryId: 'entry-sun222',
        dogName: 'Biscuit',
        armband: '101',
        onDesk: false,
        place: 'Sun Nov 22, Trial 2, entry SUN222',
      },
      {
        entryId: 'entry-none33',
        dogName: 'Biscuit',
        armband: '101',
        onDesk: false,
        place: 'trial day unknown, entry NONE33',
      },
    ]);
    expect(list.items.find(item => item.entryId === 'other')).toMatchObject({
      onDesk: true,
      place: 'Sat Nov 21, Trial 1, entry OTHER',
    });
  });

  it('is off the desk only when every flag has no class: then nothing is desk-resolvable', () => {
    expect(collectFlaggedPulls([flag({ class: null })]).deskResolvable).toBe(false);
  });
});
