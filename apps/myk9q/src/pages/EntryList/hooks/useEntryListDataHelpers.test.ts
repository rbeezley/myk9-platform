import { describe, expect, it } from 'vitest';
import type { Entry as ReplicatedEntry } from '@/services/replication/tables/ReplicatedEntriesTable';
import { transformReplicatedEntry } from './useEntryListDataHelpers';

describe('transformReplicatedEntry', () => {
  it('normalizes replicated scratched entries to pulled for ringside order', () => {
    const entry: ReplicatedEntry = {
      id: '1',
      armband: 12,
      handler: 'Handler Name',
      dog_call_name: 'Bella',
      class_id: '42',
      entry_status: 'scratched',
      is_scored: false,
      is_in_ring: false,
      license_key: 'license-1',
    };

    expect(transformReplicatedEntry(entry).status).toBe('pulled');
  });
});
