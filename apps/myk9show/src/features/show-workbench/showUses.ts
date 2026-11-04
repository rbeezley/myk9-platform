import type { Show } from '@/types/show-types';
import { SHOW_USES_DEFAULTS } from '@/services/replication/showUsesColumns';

/** The five `shows` columns of the "This show uses..." switches, resolved to booleans. */
export interface ShowUses {
  usesDeviceScoring: boolean;
  usesPaperPacket: boolean;
  usesVolunteers: boolean;
  usesLandingPage: boolean;
  publishesOwnPremium: boolean;
}

type ShowUsesSource = Partial<Record<keyof ShowUses, boolean | undefined>>;

/**
 * The ONE reader of the switches (MYK9-1686): an unset field resolves to the column default, so a
 * cached pre-migration show reads the same as a fresh one. Consumers never read the raw fields.
 * Self check-in is not here: it lives in `show_visibility_settings`, not on the show row.
 */
export function resolveShowUses(show: ShowUsesSource | Show | null | undefined): ShowUses {
  const resolved: ShowUses = { ...SHOW_USES_DEFAULTS };
  if (!show) return resolved;
  for (const key of Object.keys(resolved) as (keyof ShowUses)[]) {
    const value = show[key];
    if (value !== undefined) resolved[key] = value;
  }
  return resolved;
}
