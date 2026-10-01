import { describe, expect, it } from 'vitest';
import { entryToSupabaseRow, type ReplicatedEntry } from './ReplicatedEntriesTable.mapper';

// MYK9-878 (last hop): the override request reaches the queued INSERT row, and an
// ordinary entry never carries the column (a whole-row upload must not send it).
describe('entryToSupabaseRow junior fee override request', () => {
  it('carries the request marker on the insert row', () => {
    const payload = entryToSupabaseRow({
      id: 'entry-1',
      juniorFeeOverrideBy: '00000000-0000-0000-0000-000000000000',
    } as ReplicatedEntry);

    expect(payload).toHaveProperty(
      'junior_fee_override_by',
      '00000000-0000-0000-0000-000000000000'
    );
  });

  it('leaves the column out of an ordinary entry', () => {
    const payload = entryToSupabaseRow({ id: 'entry-1', entryFee: 35 } as ReplicatedEntry);

    expect(payload).not.toHaveProperty('junior_fee_override_by');
  });
});
