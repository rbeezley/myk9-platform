/**
 * Regression test for impeccable p3 audit finding A3.
 *
 * `entries.comped` / `entries.comped_reason` are real persisted columns, written
 * by `compEntry`, and BOTH secretary read paths already selected them -- the
 * PostgREST one via `AUTHENTICATED_ENTRY_READ_COLUMNS` and the replicated one
 * via `ReplicatedEntriesTable`'s mapper. The one missing link was
 * `mapSecretaryEntryToEntryManagementEntry`, which never assigned them.
 *
 * The consequence was silent and repeatable: `entry.comped` was set only by the
 * optimistic local patch in `useEntryManagementActions`, so any `loadEntries()`
 * -- a bulk action, a refresh, a reload -- dropped the Comped badge and put the
 * "Comp" button back for an entry that was already comped, inviting a duplicate
 * comp. `compedReason` was unrecoverable from the UI entirely.
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
    entry_status: 'pending',
    payment_status: 'pending',
    entry_fee: 25,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  } as unknown as SecretaryEntry;
}

describe('mapSecretaryEntryToEntryManagementEntry — comp state (audit A3)', () => {
  it('carries a comped entry through the mapper', () => {
    const mapped = mapSecretaryEntryToEntryManagementEntry(
      secretaryEntry({ comped: true, comped_reason: 'Club volunteer' })
    );

    expect(mapped.comped).toBe(true);
    expect(mapped.compedReason).toBe('Club volunteer');
  });

  it('carries an explicit not-comped through, rather than dropping it', () => {
    const mapped = mapSecretaryEntryToEntryManagementEntry(secretaryEntry({ comped: false }));

    expect(mapped.comped).toBe(false);
  });

  it('leaves comp state unset when the row says nothing about it', () => {
    const mapped = mapSecretaryEntryToEntryManagementEntry(secretaryEntry());

    expect(mapped.comped).toBeUndefined();
    expect(mapped.compedReason).toBeUndefined();
  });

  it('a comped entry survives a reload, so "Comp" is not offered twice', () => {
    // The exact sequence that used to lose it: comp locally, then reload from
    // the database and re-map the row.
    const fromDatabase = secretaryEntry({ comped: true, comped_reason: 'Judge hospitality' });

    const afterReload = mapSecretaryEntryToEntryManagementEntry(fromDatabase);

    expect(afterReload.comped).toBe(true);
    expect(afterReload.compedReason).toBe('Judge hospitality');
  });
});
