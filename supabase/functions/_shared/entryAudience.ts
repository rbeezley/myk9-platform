/**
 * Row shape of the owner / co-owner / handler audience embed used by the push
 * triggers. The untyped supabase-js client infers every embedded relation as an
 * array; entries.dog_id, dogs.owner_id, dogs.co_owner_id and entries.handler_id
 * are single-column many-to-one foreign keys, so PostgREST returns an object (or
 * null) at runtime. Apply with `.returns<EntryAudienceRow[]>()`.
 */
interface AuthUserRef {
  auth_user_id: string | null;
}

export interface EntryAudienceRow {
  dog: { owner: AuthUserRef | null; co_owner: AuthUserRef | null } | null;
  handler: AuthUserRef | null;
}

/** user_roles.user_id -> people(id) is many-to-one too (migration 005). */
export interface RolePersonRow {
  person: AuthUserRef | null;
}
