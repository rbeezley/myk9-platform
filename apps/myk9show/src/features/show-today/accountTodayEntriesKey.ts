import type { QueryClient } from '@tanstack/react-query';

export const accountTodayEntriesQueryKey = (userId: string | undefined) =>
  ['account-today-entries', userId ?? 'anonymous'] as const;

/**
 * MYK9-1307: the exhibitor's own online entry and check-in never write the entries replica, so the
 * replica subscription cannot see them. Call this where those changes succeed.
 */
export function invalidateAccountTodayEntries(
  queryClient: QueryClient,
  userId: string | undefined
): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: accountTodayEntriesQueryKey(userId) });
}
