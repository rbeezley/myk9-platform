// MYK9-1776: one answer to "may this caller use this show as AskQ context?",
// taken from the same server-side predicate the replication engine uses for
// entry results (club-scoped secretary or club admin, show-scoped manager,
// steward, assigned judge, ringside claim, own or exhibitor entry). Restating
// it here as a user_roles lookup missed every club appointment.
export interface ShowAccessClient {
  rpc(
    name: 'entry_results_caller_has_no_show_access',
    args: { p_show_id: string }
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/**
 * Runs as the caller (user-JWT client), so auth.uid() is the asker. The RPC
 * answers "proven no access", and answers FALSE on doubt, so access is only
 * granted on an explicit `false`; an error or any other shape denies.
 */
export async function callerHasShowAccess(
  client: ShowAccessClient,
  showId: string
): Promise<boolean> {
  const { data, error } = await client.rpc('entry_results_caller_has_no_show_access', {
    p_show_id: showId,
  });
  if (error) return false;
  return data === false;
}
