import type { User } from '@/types/user-types';

/**
 * MYK9-2253: a short directory load may miss people the saved copy holds. The rows that
 * arrived win by id; saved people the load missed stay. Sorted by last then first name,
 * as the full load is.
 */
export function mergeShortDirectoryLoad(arrived: User[], saved: User[]): User[] {
  const ids = new Set(arrived.map(user => user.id));
  return [...arrived, ...saved.filter(user => !ids.has(user.id))].sort(
    (a, b) =>
      (a.lastName ?? '').localeCompare(b.lastName ?? '') ||
      (a.firstName ?? '').localeCompare(b.firstName ?? '')
  );
}
