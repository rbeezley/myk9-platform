// Tenant scope filter for the AI assistant's data tools. These tools run with a
// SERVICE-ROLE client that bypasses RLS, so this is the ONLY tenant guard —
// it must fail closed. `Q` is any Supabase query exposing `.eq()`.
export interface ShowScope {
  licenseKey?: string;
  showId?: string;
}

// A UUID that no real row uses — forces zero rows when scope is unresolved.
const IMPOSSIBLE_SHOW_ID = '00000000-0000-0000-0000-000000000000';

export function applyShowScope<Q extends { eq(column: string, value: unknown): Q }>(
  query: Q,
  scope: ShowScope
): Q {
  if (scope.showId) {
    return query.eq('show_id', scope.showId);
  }
  if (scope.licenseKey) {
    return query.eq('license_key', scope.licenseKey);
  }
  // Fail closed: an unresolved scope must return NO rows. Returning the query
  // unfiltered here leaked every club's entries via the service-role client.
  return query.eq('show_id', IMPOSSIBLE_SHOW_ID);
}
