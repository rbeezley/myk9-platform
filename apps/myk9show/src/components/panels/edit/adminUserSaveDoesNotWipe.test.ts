/**
 * MYK9-570 round-2 review, P1. A save from `/admin/users` was destroying the two
 * columns the whole feature reads.
 *
 * `/admin/users` loads through the `get_admin_user_list` RPC, whose TABLE
 * signature carries no `date_of_birth` and no `junior_handler_numbers`. Those
 * arrive as `undefined`, become `''` and `{}` in the form, and were then emitted
 * UNCONDITIONALLY on save — so a site admin correcting a phone number wrote
 * `date_of_birth = null` and `junior_handler_numbers = {}` over real data.
 *
 * This runs the REAL chain, every hop, because that is where the bug lived: the
 * round-1 test asserted `buildUserEditSavePayload` "omits them when the panel did
 * not produce them", which is true of that function alone and false of the
 * pipeline feeding it (LESSON last-hop-drop, pointing the other way).
 */
import { describe, expect, it } from 'vitest';
import { mapDbUserToUser, mapUserToDbUpdate } from '@/hooks/queries/useUsersQuery';
import { buildUserEditSavePayload } from '@/components/users/UserDetails/userEditSavePayload';
import { formDataToUser, userToFormData } from './UserEditPanel.helpers';
import type { UserFormData } from './UserEditPanel.types';

/**
 * Exactly the columns `get_admin_user_list` returns, read from
 * `pg_get_function_result` on the live database. Deliberately NOT a full people
 * row — the narrowness is the whole point.
 */
const ADMIN_LIST_ROW = {
  id: 'person-1',
  first_name: 'Mariana',
  last_name: 'Rivera',
  email: 'mariana@example.com',
  phone: '555-0199',
  status: 'active',
  profile_image: null,
  deleted_at: null,
  deleted_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

/** The full row `/people/:id` loads, through PEOPLE_DIRECTORY_COLUMNS. */
const DIRECTORY_ROW = {
  ...ADMIN_LIST_ROW,
  street_address: '1 Main St',
  city: 'Springfield',
  state: 'IL',
  zip_code: '62701',
  country: 'USA',
  auth_user_id: 'auth-1',
  date_of_birth: '2011-03-04',
  junior_handler_numbers: { AKC: '7654321' },
};

/** RPC row → mapper → form → back → payload → database update. */
function saveThrough(
  row: Record<string, unknown>,
  edit: (form: UserFormData) => UserFormData = form => form
) {
  const user = mapDbUserToUser(row as Parameters<typeof mapDbUserToUser>[0]);
  const form = edit(userToFormData(user));
  return mapUserToDbUpdate(buildUserEditSavePayload(formDataToUser(form)));
}

describe('a save from /admin/users does not wipe what it never loaded', () => {
  it('emits neither junior column when the row did not carry them', () => {
    const update = saveThrough(ADMIN_LIST_ROW, form => ({ ...form, phone: '555-0200' }));

    expect('date_of_birth' in update, 'a phone edit must not touch the date of birth').toBe(false);
    expect('junior_handler_numbers' in update).toBe(false);
    // The edit itself still lands.
    expect(update.phone).toBe('555-0200');
  });

  it('still round-trips them from a surface that DID load them', () => {
    const update = saveThrough(DIRECTORY_ROW);
    expect(update.date_of_birth).toBe('2011-03-04');
    expect(update.junior_handler_numbers).toEqual({ AKC: '7654321' });
  });

  it('lets an admin SET a date of birth on a row that arrived without one', () => {
    // Not emitting an untouched field must not become "never emit it" — the
    // whole point of the field is that someone can fill it in.
    const update = saveThrough(ADMIN_LIST_ROW, form => ({
      ...form,
      dateOfBirth: '2011-03-04',
      juniorHandlerNumbers: { AKC: '7654321' },
    }));
    expect(update.date_of_birth).toBe('2011-03-04');
    expect(update.junior_handler_numbers).toEqual({ AKC: '7654321' });
  });

  it('lets a surface that loaded them CLEAR them', () => {
    const update = saveThrough(DIRECTORY_ROW, form => ({
      ...form,
      dateOfBirth: '',
      juniorHandlerNumbers: {},
    }));
    expect(update.date_of_birth).toBeNull();
    expect(update.junior_handler_numbers).toEqual({});
  });
});
