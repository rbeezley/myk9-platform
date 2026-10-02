import { describe, expect, it } from 'vitest';
import { buildClassEntryBreakdowns, formatClassEntryBreakdown } from '../classEntryBreakdown';

const row = (classId: string, status: string, extra: Record<string, unknown> = {}) => ({
  class_id: classId,
  entry_status: status,
  ...extra,
});

describe('buildClassEntryBreakdowns', () => {
  it('counts paid and promotion-expired as pending, as the Entries review lane does', () => {
    const breakdowns = buildClassEntryBreakdowns([
      row('c1', 'confirmed'),
      row('c1', 'submitted'),
      row('c1', 'pending-payment'),
      row('c1', 'paid'),
      row('c1', 'promotion-expired'),
      row('c2', 'confirmed'),
    ]);
    expect(breakdowns.get('c1')).toEqual({ entered: 1, pending: 4 });
    expect(breakdowns.get('c2')).toEqual({ entered: 1, pending: 0 });
  });

  it('keeps checked-in, in-ring, scored and absent dogs entered on show day', () => {
    expect(
      buildClassEntryBreakdowns([
        row('c1', 'checked-in'),
        row('c1', 'at-gate'),
        row('c1', 'in-ring'),
        row('c1', 'completed'),
        row('c1', 'absent'),
        row('c1', 'move-up-requested'),
      ]).get('c1')
    ).toEqual({ entered: 6, pending: 0 });
  });

  it('leaves out withdrawn, rejected, scratched and moved entries, and soft-deleted rows', () => {
    expect(
      buildClassEntryBreakdowns([
        row('c1', 'confirmed'),
        row('c1', 'withdrawn'),
        row('c1', 'not_accepted'),
        row('c1', 'scratched'),
        row('c1', 'moved'),
        row('c1', 'confirmed', { deleted_at: '2026-10-01T00:00:00Z' }),
      ]).get('c1')
    ).toEqual({ entered: 1, pending: 0 });
  });

  it('ignores rows with no class', () => {
    expect(buildClassEntryBreakdowns([{ entry_status: 'confirmed' }]).size).toBe(0);
  });
});

describe('formatClassEntryBreakdown', () => {
  it('always shows entered, and pending only when there is any', () => {
    expect(formatClassEntryBreakdown({ entered: 18, pending: 2 })).toEqual({
      entered: '18 entered',
      pending: '2 pending',
    });
    expect(formatClassEntryBreakdown({ entered: 0, pending: 0 })).toEqual({
      entered: '0 entered',
    });
  });
});
