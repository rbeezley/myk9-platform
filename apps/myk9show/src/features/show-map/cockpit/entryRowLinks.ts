import type { SecretaryCockpitClassEntry } from './cockpitClassEntries';
import type { CockpitLifecycle } from './secretaryCockpitTypes';

/** The entry's form on Entry Management (the link the delete-blocked prompt uses), where Edit entry lives. */
export function entryEditHref(showId: string, entryId: string): string {
  return `/shows/${encodeURIComponent(showId)}/entries?queue=all&entry=${encodeURIComponent(entryId)}`;
}

/**
 * A dog that can still run (waiting or in the ring) in a class that is open for scoring. A
 * cancelled class saves nothing and a complete class's results are settled, so neither offers it;
 * an unknown lifecycle does not either.
 */
export function canMarkAbsent(
  entry: Pick<SecretaryCockpitClassEntry, 'state'>,
  classLifecycle: CockpitLifecycle | null
): boolean {
  const runnable = entry.state === 'waiting' || entry.state === 'in-ring';
  return runnable && (classLifecycle === 'not-started' || classLifecycle === 'in-progress');
}
