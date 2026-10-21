import type { Query, QueryClient } from '@tanstack/react-query';

/**
 * Marks the two dog roster reads (`useDogsQuery`, `useDogsByOwnerQuery`) so a
 * cache listener can tell them from the dog detail, registrations and
 * statistics reads that share their key prefixes (MYK9-1303).
 */
export const DOG_ROSTER_META = { dogRoster: true } as const;

export const isDogRosterQuery = (query: Query): boolean => query.meta?.dogRoster === true;

/**
 * Refetch the dog rosters now. A write on this device (a registration add, edit
 * or delete) calls this so the roster shows it at once; the registrations
 * replica listener refreshes the rosters only once per 15 s window (MYK9-1303).
 */
export const invalidateDogRosters = (queryClient: QueryClient): Promise<void> =>
  queryClient.invalidateQueries({ predicate: isDogRosterQuery });
