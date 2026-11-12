import { describe, expect, it } from 'vitest';

import type { SecretaryEntry } from '@/services/database/entries';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { patchManagementEntries, patchSecretaryEntries } from './storedEntryPatch';

const secretary = (id: string, check: string): SecretaryEntry =>
  ({
    id,
    check_in_status: check,
    check_in_pulled_by: 'exhibitor',
    entry_status: 'confirmed',
  }) as unknown as SecretaryEntry;

const management = (id: string, check: 'no-status' | 'pulled'): EntryManagementEntry =>
  ({
    id,
    entryStatus: 'accepted',
    rawEntryStatus: 'confirmed',
    classes: [{ id, status: 'entered', checkInStatus: check, checkInPulledBy: 'staff' }],
  }) as unknown as EntryManagementEntry;

describe('taking what a desk write stored (MYK9-1812)', () => {
  it('patches only the written secretary entry, clearing who flagged it', () => {
    const [a, b] = patchSecretaryEntries(
      [secretary('e-1', 'no-status'), secretary('e-2', 'no-status')],
      [{ entryId: 'e-1', checkInStatus: 'checked-in', entryStatus: 'scratched' }]
    );
    expect(a).toMatchObject({
      check_in_status: 'checked-in',
      check_in_pulled_by: null,
      entry_status: 'scratched',
    });
    expect(b).toMatchObject({ check_in_status: 'no-status', check_in_pulled_by: 'exhibitor' });
  });

  it('patches Entry Management entries, and the last write to an entry wins', () => {
    const [a] = patchManagementEntries(
      [management('e-1', 'no-status')],
      [
        { entryId: 'e-1', checkInStatus: 'checked-in' },
        { entryId: 'e-1', checkInStatus: 'conflict' },
      ]
    );
    expect(a!.classes[0]).toMatchObject({ checkInStatus: 'conflict', checkInPulledBy: null });
  });

  it('marks a Pull as scratched on the entry and its class', () => {
    const [a] = patchManagementEntries(
      [management('e-1', 'no-status')],
      [{ entryId: 'e-1', checkInStatus: 'pulled', entryStatus: 'scratched' }]
    );
    expect(a).toMatchObject({ rawEntryStatus: 'scratched' });
    expect(a!.classes[0]).toMatchObject({ status: 'scratched', checkInStatus: 'pulled' });
  });

  it('leaves entries alone when the write names none of them', () => {
    const entries = [management('e-1', 'no-status')];
    expect(
      patchManagementEntries(entries, [{ entryId: 'other', checkInStatus: 'pulled' }])
    ).toEqual(entries);
  });
});
