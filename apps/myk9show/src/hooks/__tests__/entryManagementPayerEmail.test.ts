import { describe, expect, it } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';
import { mapSecretaryEntryToEntryManagementEntry } from '../useEntryManagementData';

function row(registration: unknown) {
  return fromAny<Parameters<typeof mapSecretaryEntryToEntryManagementEntry>[0], unknown>({
    id: 'e1',
    show_id: 'show-1',
    handler: 'Hank Handler',
    handler_person: null,
    dog: {
      id: 'd1',
      name: 'Rex',
      owner: { id: 'o1', first_name: 'Olive', last_name: 'Owner', email: 'olive@example.com' },
    },
    class: null,
    registration,
  });
}

// MYK9-2483: the decision email goes to the enrollment's handler, a different person from the owner.
describe('enrollmentPayerEmail', () => {
  it('carries the handler address apart from the owner address', () => {
    const entry = mapSecretaryEntryToEntryManagementEntry(
      row({ id: 'r1', handler_id: 'h1', payer: { email: 'hank@example.com' } })
    );
    expect(entry.enrollmentPayerEmail).toBe('hank@example.com');
    expect(entry.ownerEmail).toBe('olive@example.com');
  });

  it('is blank when the handler has none or there is no handler', () => {
    expect(
      mapSecretaryEntryToEntryManagementEntry(
        row({ id: 'r1', handler_id: 'h1', payer: { email: null } })
      ).enrollmentPayerEmail
    ).toBe('');
    expect(
      mapSecretaryEntryToEntryManagementEntry(row({ id: 'r1', handler_id: null, payer: null }))
        .enrollmentPayerEmail
    ).toBe('');
  });

  it('is absent when the handler address was not read', () => {
    expect(
      mapSecretaryEntryToEntryManagementEntry(row({ id: 'r1', handler_id: 'h1' }))
        .enrollmentPayerEmail
    ).toBeUndefined();
    expect(mapSecretaryEntryToEntryManagementEntry(row(null)).enrollmentPayerEmail).toBeUndefined();
  });
});
