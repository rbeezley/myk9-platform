import { describe, expect, it } from 'vitest';
import { mapReplicatedEntryToDbRow } from '../entryMappers';
import { rowToEntry } from '@/services/replication/ReplicatedEntriesTable';

describe('mapReplicatedEntryToDbRow', () => {
  it('preserves financial closeout fields from replicated rows', () => {
    const replicated = rowToEntry({
      id: 'entry-financial',
      class_id: 'class-1',
      show_id: 'show-1',
      dog_id: 'dog-1',
      entry_status: 'accepted',
      entry_fee: 60,
      payment_status: 'partial_refund',
      payment_method: 'credit_card',
      discount_amount: 10,
      refund_amount: 20,
      refunded_at: '2026-06-01T12:00:00.000Z',
      comped: false,
      comped_reason: null,
      updated_at: '2026-06-01T12:01:00.000Z',
    } as Parameters<typeof rowToEntry>[0]);

    const row = mapReplicatedEntryToDbRow(replicated);

    expect(row).toMatchObject({
      entry_status: 'accepted',
      entry_fee: 60,
      payment_status: 'partial_refund',
      payment_method: 'credit_card',
      discount_amount: 10,
      refund_amount: 20,
      refunded_at: '2026-06-01T12:00:00.000Z',
      comped: false,
      comped_reason: null,
    });
  });

  it('preserves the show-cascade tombstone for the exhibitor entry surface', () => {
    const deletedAt = '2026-08-24T12:00:00.000Z';
    const replicated = rowToEntry({
      id: 'entry-cancelled-show',
      deleted_at: deletedAt,
    } as Parameters<typeof rowToEntry>[0]);

    expect(mapReplicatedEntryToDbRow(replicated).deleted_at).toBe(deletedAt);
  });
});
