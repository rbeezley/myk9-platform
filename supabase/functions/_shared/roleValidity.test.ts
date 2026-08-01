import { describe, expect, it, vi } from 'vitest';

import { ACTIVE_ROLE_NOT_EXPIRED, applyActiveRoleValidity, isCurrentRole } from './roleValidity.ts';

describe('role validity', () => {
  it('applies the shared active and unexpired query contract', () => {
    const query = {
      eq: vi.fn(() => query),
      or: vi.fn(() => query),
    };

    applyActiveRoleValidity(query);

    expect(query.eq).toHaveBeenCalledWith('is_active', true);
    expect(query.or).toHaveBeenCalledWith(ACTIVE_ROLE_NOT_EXPIRED);
  });

  it.each([
    { is_active: false, expires_at: null, expected: false },
    { is_active: true, expires_at: '2026-08-01T11:59:59.999Z', expected: false },
    { is_active: true, expires_at: '2026-08-01T12:00:00.000Z', expected: false },
    { is_active: true, expires_at: '2026-08-01T12:00:01.000Z', expected: true },
    { is_active: true, expires_at: null, expected: true },
  ])(
    'recognizes current role rows: $is_active / $expires_at',
    ({ is_active, expires_at, expected }) => {
      expect(isCurrentRole({ is_active, expires_at }, new Date('2026-08-01T12:00:00.000Z'))).toBe(
        expected
      );
    }
  );
});
