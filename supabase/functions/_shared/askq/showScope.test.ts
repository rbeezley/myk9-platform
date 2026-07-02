import { describe, expect, it } from 'vitest';
import { applyShowScope } from './showScope';

// Minimal fake matching the `.eq(col, val)` surface applyShowScope uses.
function makeFakeQuery() {
  const calls: Array<{ col: string; val: unknown }> = [];
  const q = {
    calls,
    eq(col: string, val: unknown) {
      calls.push({ col, val });
      return q;
    },
  };
  return q;
}

describe('applyShowScope', () => {
  it('filters by show_id when a show scope is present', () => {
    const q = makeFakeQuery();
    applyShowScope(q, { showId: 'show-1' });
    expect(q.calls).toEqual([{ col: 'show_id', val: 'show-1' }]);
  });

  it('filters by license_key when only a license scope is present', () => {
    const q = makeFakeQuery();
    applyShowScope(q, { licenseKey: 'lic-1' });
    expect(q.calls).toEqual([{ col: 'license_key', val: 'lic-1' }]);
  });

  // THE REGRESSION THIS PLAN FIXES: empty scope must return NO rows, never all.
  it('fails closed (matches no rows) when no scope is resolved', () => {
    const q = makeFakeQuery();
    applyShowScope(q, {});
    // Exactly one filter applied, and it is an impossible predicate — NOT an
    // unfiltered query. The old code applied zero filters here.
    expect(q.calls.length).toBe(1);
    expect(q.calls[0].col).toBe('show_id');
    expect(q.calls[0].val).toBe('00000000-0000-0000-0000-000000000000');
  });
});
