import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import { HttpError } from '../_shared/http/responses.ts';
import { applyActiveRoleValidity } from '../_shared/roleValidity.ts';
import { USER_ROLE_HOLDER_EMBED } from '../_shared/userRolePerson.ts';

export interface Recipient {
  authUserId: string;
  email: string | null;
  name: string;
}

interface RecipientRow {
  auth_user_id?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export async function getOwnerRecipient(
  supabase: SupabaseClient,
  ownerId: string
): Promise<Recipient[]> {
  const { data } = await supabase
    .from('people')
    .select('auth_user_id, email, first_name, last_name')
    .eq('auth_user_id', ownerId)
    .maybeSingle();
  return data?.auth_user_id ? [mapRecipient(data)] : [];
}

export async function getSiteAdminRecipients(supabase: SupabaseClient): Promise<Recipient[]> {
  const { data, error } = await applyActiveRoleValidity(
    supabase
      .from('user_roles')
      .select(
        `${USER_ROLE_HOLDER_EMBED}!inner(auth_user_id, email, first_name, last_name), roles!inner(name)`
      )
      .eq('roles.name', 'site_admin')
      .not('people.auth_user_id', 'is', null)
  );
  if (error) {
    throw new HttpError(500, 'Audience resolution failed');
  }
  const people = ((data ?? []) as Array<{ people: RecipientRow | RecipientRow[] | null }>)
    .map(row => (Array.isArray(row.people) ? row.people[0] : row.people))
    .filter((row): row is RecipientRow => !!row);
  return people.map(mapRecipient);
}

function mapRecipient(row: RecipientRow): Recipient {
  return {
    authUserId: row.auth_user_id ?? '',
    email: row.email ?? null,
    name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'there',
  };
}
