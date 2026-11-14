import { describe, it, expect } from 'vitest';
import { queueCheckInStatus, type NotificationEntryRow } from './queueCheckInStatus';

function row(overrides: Partial<NotificationEntryRow> = {}): NotificationEntryRow {
  return {
    id: 'e1',
    dog_id: 'd1',
    class_id: 'c1',
    show_id: 's1',
    check_in_status: 'checked-in',
    armband: '10',
    is_scored: false,
    result_status: null,
    dog_call_name: 'Ditto',
    ...overrides,
  };
}

describe('queueCheckInStatus', () => {
  it('passes a runnable row check-in status through', () => {
    expect(queueCheckInStatus(row())).toBe('checked-in');
  });

  it('is in-ring when is_in_ring is true, whatever the check-in status says', () => {
    expect(queueCheckInStatus(row({ is_in_ring: true, check_in_status: 'no-status' }))).toBe(
      'in-ring'
    );
    expect(queueCheckInStatus(row({ is_in_ring: true, check_in_status: 'at-gate' }))).toBe(
      'in-ring'
    );
  });

  it('is pulled for a deleted row, even one flagged in the ring', () => {
    expect(queueCheckInStatus(row({ deleted_at: '2026-11-01T00:00:00Z', is_in_ring: true }))).toBe(
      'pulled'
    );
  });

  it('is pulled for a moved row', () => {
    expect(queueCheckInStatus(row({ entry_status: 'moved', is_in_ring: true }))).toBe('pulled');
  });

  it('is pulled for a withdrawn row', () => {
    expect(queueCheckInStatus(row({ entry_status: 'withdrawn' }))).toBe('pulled');
  });

  it('is pulled for a scored row', () => {
    expect(queueCheckInStatus(row({ is_scored: true }))).toBe('pulled');
  });
});
