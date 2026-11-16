export type ClassLifecycle = 'not-started' | 'in-progress' | 'complete' | 'cancelled';

/**
 * A class's or trial's status, normalised (trim, lowercase, spaces to underscores) so every
 * spelling the data carries reads the same. The one definition: the app's cockpit and the print
 * reminder (MYK9-2086 part B) must agree on which classes are cancelled.
 */
export function lifecycleFor(status: string | null | undefined): ClassLifecycle | null {
  switch ((status ?? '').trim().toLowerCase().replace(/\s+/g, '_')) {
    case 'setup':
    case 'scheduled':
    case 'upcoming':
    case 'not_started':
      return 'not-started';
    case 'in_progress':
    case 'active':
      return 'in-progress';
    case 'complete':
    case 'completed':
      return 'complete';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    default:
      return null;
  }
}

export function isCancelledStatus(status: string | null | undefined): boolean {
  return lifecycleFor(status) === 'cancelled';
}
