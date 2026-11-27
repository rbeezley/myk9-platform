/**
 * MYK9-2479, docs/plan-offline-desk-payments-shared-device.md § 3.2: a desk payment that
 * stops sending is logged without its amount, date, check number or form. Those stay on
 * the device, on the payment's own line. Every other failed mutation is logged as before.
 */
import { describe, expect, it } from 'vitest';
import { forFailureLog } from '../deskPaymentEvents';

const DESK_ARGS = {
  p_enrollment_id: 'enr-1',
  p_kind: 'payment',
  p_amount: 37.5,
  p_method: 'check',
  p_received_on: '2026-11-26',
  p_reference: '1042',
  p_client_payment_id: 'pay-1',
};

describe('the failure log carries no desk payment details', () => {
  it('keeps only the id, table, operation and failure kind of a desk payment', () => {
    const logged = forFailureLog({
      id: 'mut-1',
      tableName: 'show_payments',
      operation: 'INSERT',
      failureKind: 'permanent',
      error: 'received date 2026-11-30 is after today (2026-11-26) on the show calendar',
      rpc: { name: 'record_enrollment_payment', args: DESK_ARGS },
    });

    expect(logged).toEqual({
      id: 'mut-1',
      tableName: 'show_payments',
      operation: 'INSERT',
      failureKind: 'permanent',
    });
    expect(JSON.stringify(logged)).not.toMatch(/37\.5|1042|2026-11|enr-1/);
  });

  it('logs any other failed mutation unchanged', () => {
    const score = {
      id: 'mut-2',
      tableName: 'entries',
      operation: 'UPDATE' as const,
      error: 'permission denied',
      rpc: { name: 'ringside_update_entry', args: { p_entry_id: 'e-1' } },
    };
    expect(forFailureLog(score)).toBe(score);
  });
});
