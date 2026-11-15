// Who may ask for a receipt on someone else's registration (MYK9-1999). Deno-free.
//
// The show's managers, by the database's own predicates, run as the caller: can_manage_show
// (platform admin, club admin, the club's secretary) or is_show_secretary (site admin, the
// club's secretary). Both apply the role's is_active and expires_at. The role-name lookup this replaces matched only 'trial_secretary',
// a role the database does not seed, so a real secretary was refused the receipt she keyed in.
// Same predicates and fail-closed rule as generate-premium/authz.ts.

export interface ManagerAuthzClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

export const SHOW_MANAGER_PREDICATES = ['can_manage_show', 'is_show_secretary'] as const;

/** 'manager', 'not-a-manager', or 'check-failed' (an errored check authorizes nobody). */
export async function resolveShowManager(
  client: ManagerAuthzClient,
  showId: string
): Promise<'manager' | 'not-a-manager' | 'check-failed'> {
  const results = await Promise.all(
    SHOW_MANAGER_PREDICATES.map(fn => client.rpc(fn, { check_show_id: showId }))
  );
  if (results.some(result => result.error)) return 'check-failed';
  return results.some(result => result.data === true) ? 'manager' : 'not-a-manager';
}
