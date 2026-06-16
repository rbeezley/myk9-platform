import type { Trial } from '@/components/trials/types/trial.types';
import { mapDatabaseTrialsArray, type DbTrialWithShow } from '@/services/mappers/trialMappers';

/**
 * Choose the trials the public styled landing should render.
 *
 * The trial store (`associatedTrials`) is fed by the replication layer, which does NOT sync
 * for guests — so a cold signed-out visitor has zero replicated trials even though the public
 * show loaded. When the store is empty we fall back to public trial rows fetched directly via
 * PostgREST (anon-safe), mapped into the `Trial[]` shape the landing expects. Authenticated /
 * warm sessions keep using the store rows unchanged.
 */
export function pickLandingTrials(
  associatedTrials: Trial[],
  publicTrialRows: unknown[] | null | undefined
): Trial[] {
  if (associatedTrials.length > 0) return associatedTrials;
  return mapDatabaseTrialsArray((publicTrialRows ?? []) as unknown as DbTrialWithShow[]);
}
