/**
 * MYK9-1162: the server's held verdict reaches the Entries page. The
 * "Registration number needed" pane lists exactly the entries carrying it, so a
 * mapper that dropped the field would empty the pane with every test above it
 * still green.
 */
import { describe, it, expect } from 'vitest';
import { mapSecretaryEntryToEntryManagementEntry } from '../useEntryManagementData';
import type { SecretaryEntry } from '@/services/database/entries';

function secretaryEntry(overrides: Partial<SecretaryEntry> = {}): SecretaryEntry {
  return {
    id: 'entry-1',
    show_id: 'show-1',
    dog_id: 'dog-1',
    class_id: 'class-1',
    entry_status: 'confirmed',
    payment_status: 'pending',
    entry_fee: 25,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  } as unknown as SecretaryEntry;
}

describe('mapSecretaryEntryToEntryManagementEntry — held verdict (MYK9-1162)', () => {
  it('carries a held entry through the mapper', () => {
    const mapped = mapSecretaryEntryToEntryManagementEntry(
      secretaryEntry({ awaiting_registration_number: true })
    );
    expect(mapped.awaitingRegistrationNumber).toBe(true);
  });

  it('leaves the field off an entry the server does not hold', () => {
    for (const awaiting_registration_number of [false, null, undefined]) {
      const mapped = mapSecretaryEntryToEntryManagementEntry(
        secretaryEntry({ awaiting_registration_number })
      );
      expect(mapped.awaitingRegistrationNumber).toBeUndefined();
    }
  });
});
