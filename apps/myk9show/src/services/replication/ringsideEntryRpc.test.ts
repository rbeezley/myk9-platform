/**
 * Tests for the ringside RPC auto-routing decision.
 *
 * The contract: an entries UPDATE routes through ringside_update_entry IFF every
 * column it touches (ignoring auto/system columns) is in the ringside whitelist.
 * A write touching ANY non-ringside column (entry_status, armband, refunds…)
 * stays on the direct UPDATE path so secretary entry-management is unaffected.
 *
 * buildRingsideRpcFields pulls VALUES from the canonical snake_case Supabase row,
 * and KEYS from the caller's update keys (camel or snake), so a reset that sets an
 * explicit null persists as null.
 */

import { describe, expect, it } from 'vitest';
import { buildRingsideRpcFields, toSnakeCase, RINGSIDE_RPC_COLUMNS } from './ringsideEntryRpc';

describe('toSnakeCase', () => {
  it('converts camelCase to snake_case and passes snake through', () => {
    expect(toSnakeCase('runOrder')).toBe('run_order');
    expect(toSnakeCase('searchTimeSeconds')).toBe('search_time_seconds');
    expect(toSnakeCase('area1TimeSeconds')).toBe('area1_time_seconds');
    expect(toSnakeCase('checkInStatus')).toBe('check_in_status');
    expect(toSnakeCase('check_in_status')).toBe('check_in_status');
  });
});

describe('buildRingsideRpcFields', () => {
  it('routes a run-order-only write (snake key) through the RPC', () => {
    const row = { id: 'e1', run_order: 3, armband: 10, entry_status: 'entered' };
    expect(buildRingsideRpcFields(['run_order'], row)).toEqual({ run_order: 3 });
  });

  it('routes a scoring write supplied in camelCase, pulling snake values from the row', () => {
    const row = {
      id: 'e1',
      is_scored: true,
      result_status: 'qualified',
      search_time_seconds: 42,
      total_faults: 0,
    };
    const fields = buildRingsideRpcFields(
      ['isScored', 'resultStatus', 'searchTimeSeconds', 'totalFaults'],
      row
    );
    expect(fields).toEqual({
      is_scored: true,
      result_status: 'qualified',
      search_time_seconds: 42,
      total_faults: 0,
    });
  });

  it('preserves an explicit null (a reset clearing placement)', () => {
    const row = { id: 'e1', final_placement: null, result_status: 'pending' };
    const fields = buildRingsideRpcFields(['finalPlacement', 'resultStatus'], row);
    expect(fields).toEqual({ final_placement: null, result_status: 'pending' });
  });

  it('does NOT route when any touched column is non-ringside', () => {
    const row = { id: 'e1', run_order: 3, entry_status: 'scratched' };
    // entry_status is a management column → must stay on the direct UPDATE path.
    expect(buildRingsideRpcFields(['run_order', 'entry_status'], row)).toBeNull();
  });

  it('ignores auto/system columns when deciding (check-in + updated_at still routes)', () => {
    const row = { id: 'e1', check_in_status: 'in-ring', updated_at: 'now' };
    expect(buildRingsideRpcFields(['check_in_status', 'updated_at'], row)).toEqual({
      check_in_status: 'in-ring',
    });
  });

  it('returns null for an auto-columns-only / empty write', () => {
    expect(buildRingsideRpcFields(['id', 'updated_at'], { id: 'e1', updated_at: 'now' })).toBeNull();
    expect(buildRingsideRpcFields([], {})).toBeNull();
  });

  it('whitelist covers the run-order/check-in + scoring columns the RPC accepts', () => {
    // Guards against drift between this set and the SQL migration's allow-list.
    expect(RINGSIDE_RPC_COLUMNS.has('run_order')).toBe(true);
    expect(RINGSIDE_RPC_COLUMNS.has('check_in_status')).toBe(true);
    expect(RINGSIDE_RPC_COLUMNS.has('final_placement')).toBe(true);
    expect(RINGSIDE_RPC_COLUMNS.has('is_scored')).toBe(true);
    // Management columns must NOT be present.
    expect(RINGSIDE_RPC_COLUMNS.has('entry_status')).toBe(false);
    expect(RINGSIDE_RPC_COLUMNS.has('entry_fee')).toBe(false);
    expect(RINGSIDE_RPC_COLUMNS.has('payment_status')).toBe(false);
  });
});
