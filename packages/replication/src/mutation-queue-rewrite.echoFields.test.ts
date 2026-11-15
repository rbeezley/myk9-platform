import { describe, expect, it } from 'vitest';
import { echoServerFields } from './mutation-queue-rewrite';
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

describe('echoServerFields (MYK9-2010)', () => {
  it('rewrites a field the server won to the server value in the payload and the RPC delta', () => {
    const next = echoServerFields(
      rpcMutation({ check_in_status: 'completed', ring_exit_time: 'T' }),
      {
        check_in_status: 'pulled',
      }
    );
    expect(next?.rpc?.fields).toEqual({ check_in_status: 'pulled', ring_exit_time: 'T' });
    expect(next?.data).toMatchObject({ check_in_status: 'pulled', ring_exit_time: 'T' });
  });

  it('never empties a write: a check-in-only write stays, carrying the server value', () => {
    const next = echoServerFields(rpcMutation({ check_in_status: 'in-ring' }), {
      check_in_status: 'pulled',
    });
    expect(next?.rpc?.fields).toEqual({ check_in_status: 'pulled' });
  });

  it('adds nothing and leaves a mutation that never carried the field alone', () => {
    expect(
      echoServerFields(rpcMutation({ result_status: 'qualified' }), { check_in_status: 'pulled' })
    ).toBeUndefined();
  });
});
