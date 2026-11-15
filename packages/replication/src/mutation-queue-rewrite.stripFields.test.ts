import { describe, expect, it } from 'vitest';
import { isMutationEmpty, stripQueuedFields } from './mutation-queue-rewrite';
import type { PendingMutation } from './types';

function rpcMutation(fields: Record<string, unknown>): PendingMutation {
  return {
    id: 'm1',
    tableName: 'entries',
    rowId: 'e1',
    operation: 'UPDATE',
    data: { id: 'e1', ...fields, updated_at: '2026-11-14T10:00:00Z' },
    rpc: { name: 'ringside_update_entry', fields },
  } as unknown as PendingMutation;
}

describe('stripQueuedFields (MYK9-2010)', () => {
  it('removes a field the server won from the payload and the RPC delta', () => {
    const next = stripQueuedFields(
      rpcMutation({ check_in_status: 'completed', ring_exit_time: 'T' }),
      ['check_in_status']
    );
    expect(next?.rpc?.fields).toEqual({ ring_exit_time: 'T' });
    expect(next?.data).not.toHaveProperty('check_in_status');
  });

  it('leaves a mutation that never carried the field alone', () => {
    expect(
      stripQueuedFields(rpcMutation({ result_status: 'qualified' }), ['check_in_status'])
    ).toBeUndefined();
  });

  it('a check-in-only write left with nothing to send is empty; a score write is not', () => {
    const checkInOnly = stripQueuedFields(rpcMutation({ check_in_status: 'in-ring' }), [
      'check_in_status',
    ]);
    expect(checkInOnly && isMutationEmpty(checkInOnly)).toBe(true);
    const score = stripQueuedFields(
      rpcMutation({ check_in_status: 'completed', result_status: 'qualified' }),
      ['check_in_status']
    );
    expect(score?.rpc?.fields).toEqual({ result_status: 'qualified' });
    expect(score && isMutationEmpty(score)).toBe(false);
  });
});
