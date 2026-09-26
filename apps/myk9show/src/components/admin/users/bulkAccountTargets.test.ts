import { describe, it, expect } from 'vitest';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';
import { selectedEmails } from './bulkAccountTargets';

function person(id: string, patch: { email?: string } = {}): SelectedUser {
  return {
    id,
    user: {
      id,
      firstName: id,
      lastName: 'Test',
      email: patch.email ?? `${id}@example.com`,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignInAt: null,
      ...patch,
    },
  } as SelectedUser;
}

describe('selectedEmails', () => {
  it('returns unique, trimmed, non-empty addresses in selection order', () => {
    expect(
      selectedEmails([
        person('a', { email: ' a@example.com ' }),
        person('b', { email: '' }),
        person('c', { email: 'a@example.com' }),
        person('d'),
      ])
    ).toEqual(['a@example.com', 'd@example.com']);
  });
});
