import { describe, expect, it } from 'vitest';
import { buildShowArmbandMaps, resolveEntryArmband } from '../entryArmband';
import { isOnClassRunList } from '../entryAccounting';

// MYK9-976: Ranger and Maple are withdrawn, so entries.armband is NULL, but the
// show's armbands table still holds 101 and 104.
const maps = buildShowArmbandMaps([
  { armbandNumber: '101', dogId: 'ranger', isAvailable: false },
  { armbandNumber: '102', dogId: 'juni', isAvailable: false },
  { armbandNumber: '104', dogId: 'maple', isAvailable: false },
  { armbandNumber: '105', dogId: 'free-dog', isAvailable: true },
  { armbandNumber: '106', entryId: 'entry-x', dogId: 'x', isAvailable: false },
]);

describe('resolveEntryArmband', () => {
  it('takes the show armband when the entry column is empty', () => {
    expect(resolveEntryArmband({ id: 'e1', dogId: 'ranger', armband: null }, maps)).toBe('101');
    expect(resolveEntryArmband({ id: 'e2', dogId: 'maple' }, maps)).toBe('104');
  });

  it('prefers the entry column, then the entry assignment, then the dog assignment', () => {
    expect(resolveEntryArmband({ id: 'e3', dogId: 'juni', armband: '9' }, maps)).toBe('9');
    expect(resolveEntryArmband({ id: 'entry-x', dogId: 'other' }, maps)).toBe('106');
  });

  it('ignores an available (unassigned) armband and returns null when nothing matches', () => {
    expect(resolveEntryArmband({ id: 'e4', dogId: 'free-dog' }, maps)).toBeNull();
    expect(resolveEntryArmband({ id: 'e5', dogId: null }, maps)).toBeNull();
  });
});

describe('isOnClassRunList', () => {
  it.each(['withdrawn', 'scratched', 'absent', 'moved', 'not_accepted'])(
    'drops a %s entry',
    status => {
      expect(isOnClassRunList({ entry_status: status })).toBe(false);
    }
  );

  it('drops a soft-deleted entry and keeps pending, accepted and pulled-at-check-in ones', () => {
    expect(isOnClassRunList({ entryStatus: 'confirmed', deletedAt: '2026-10-01' })).toBe(false);
    expect(isOnClassRunList({ entryStatus: 'submitted' })).toBe(true);
    expect(isOnClassRunList({ entryStatus: 'confirmed' })).toBe(true);
    expect(isOnClassRunList({ entryStatus: 'confirmed', checkInStatus: 'pulled' })).toBe(true);
  });
});
