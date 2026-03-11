import type { ComponentType } from 'react';
import type { LiveScoresheetProps, EntryScoresheetProps, ScoresheetSportType } from '../types';

type ScoresheetMode = 'live' | 'entry';

type ScoresheetRegistry = Record<
  string,
  {
    live: ComponentType<LiveScoresheetProps> | null;
    entry: ComponentType<EntryScoresheetProps> | null;
  }
>;

const registry: ScoresheetRegistry = {};

/**
 * Register a scoresheet component for a sport type and mode.
 * Called by each scoresheet module at import time.
 */
export function registerScoresheet(
  sportType: ScoresheetSportType,
  mode: 'live',
  component: ComponentType<LiveScoresheetProps>
): void;
export function registerScoresheet(
  sportType: ScoresheetSportType,
  mode: 'entry',
  component: ComponentType<EntryScoresheetProps>
): void;
export function registerScoresheet(
  sportType: ScoresheetSportType,
  mode: ScoresheetMode,
  component: ComponentType<LiveScoresheetProps> | ComponentType<EntryScoresheetProps>
): void {
  if (!registry[sportType]) {
    registry[sportType] = { live: null, entry: null };
  }
  if (registry[sportType]?.[mode] != null && registry[sportType]?.[mode] !== component) {
    console.warn(
      `[scoring-ui] Overwriting ${sportType}/${mode} registration. ` +
        `This usually means two modules register the same slot.`
    );
  }
  (registry[sportType] as Record<string, unknown>)[mode] = component;
}

/**
 * Reset the registry. For testing only.
 * @internal
 */
export function resetScoresheetRegistry(): void {
  for (const key of Object.keys(registry)) {
    delete registry[key];
  }
}

/**
 * Get the scoresheet component for a sport type and mode.
 */
export function getScoresheetComponent(
  sportType: ScoresheetSportType,
  mode: 'live'
): ComponentType<LiveScoresheetProps> | null;
export function getScoresheetComponent(
  sportType: ScoresheetSportType,
  mode: 'entry'
): ComponentType<EntryScoresheetProps> | null;
export function getScoresheetComponent(
  sportType: ScoresheetSportType,
  mode: ScoresheetMode
): ComponentType<LiveScoresheetProps> | ComponentType<EntryScoresheetProps> | null {
  return registry[sportType]?.[mode] ?? null;
}
