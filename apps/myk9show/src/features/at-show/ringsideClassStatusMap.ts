/**
 * ringside → myK9Show class-status mapping (Phase 1a, lossy spike mapping).
 *
 * ringside's class-status vocabulary is richer than myK9Show's DB CHECK
 * constraint:
 *   ringside: no-status | setup | briefing | break | start_time |
 *             in_progress | offline-scoring | completed
 *   myK9Show: setup | in_progress | completed | cancelled | upcoming
 *
 * INTENT (owner decision 2026-05-28, lossy-for-spike): the ringside
 * statuses with no faithful myK9Show target collapse to the nearest
 * coarse equivalent. This is deliberately lossy — a `briefing` or `break`
 * set at /at-show round-trips back as `in_progress`. A faithful mapping
 * (widening myK9Show's status vocabulary via migration) is a follow-up,
 * not spike scope. Do NOT "fix" this collapse without that migration.
 */

import type { ClassStatusValue } from '@myk9/ringside';

/** myK9Show class-status values its `mapClassStatusToDb` accepts (canonical lowercase). */
export type ShowClassStatus = 'setup' | 'in_progress' | 'completed' | 'cancelled' | 'upcoming';

export function toShowClassStatus(ringsideStatus: ClassStatusValue): ShowClassStatus {
  switch (ringsideStatus) {
    case 'setup':
      return 'setup';
    case 'briefing':
    case 'break':
    case 'start_time':
    case 'in_progress':
    case 'offline-scoring':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'no-status':
      return 'upcoming';
    default:
      // Exhaustiveness guard — a new ringside status fails to compile here
      // (the arg is `never` only if every case above is handled).
      return ((_: never): ShowClassStatus => 'upcoming')(ringsideStatus);
  }
}

/**
 * Inverse: myK9Show class status → ringside `ClassStatusValue`, for DISPLAY
 * (e.g. the ClassList card's status badge via `getFormattedClassStatus`).
 *
 * myK9Show's vocabulary is coarser, so this widens to the nearest ringside
 * value. `cancelled`/`upcoming` have no ringside equivalent → `no-status`.
 * Lossy by the same owner decision as `toShowClassStatus`; faithful round-trip
 * awaits the status-vocabulary migration.
 */
export function toRingsideClassStatus(showStatus: string | undefined): ClassStatusValue {
  switch (showStatus) {
    case 'setup':
      return 'setup';
    case 'in_progress':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'cancelled':
    case 'upcoming':
    default:
      return 'no-status';
  }
}
