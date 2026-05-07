/**
 * Registry config — public API.
 *
 * Usage:
 *   import { getRegistry, getSport } from '@/features/registries';
 *   const akc = getRegistry('AKC');
 *   const scentWork = getSport(akc, 'scent-work');
 */

import { akcRegistry } from './akc';
import type { Registry, RegistryId, RegistrySport } from './types';

const REGISTRIES: Readonly<Record<RegistryId, Registry>> = {
  AKC: akcRegistry,
};

/** All registry ids currently configured. */
export function listRegistries(): readonly RegistryId[] {
  return Object.keys(REGISTRIES) as RegistryId[];
}

/** Look up a registry by id. Throws if the id is not configured. */
export function getRegistry(id: RegistryId): Registry {
  const registry = REGISTRIES[id];
  if (!registry) {
    throw new Error(`Registry "${id}" is not configured`);
  }
  return registry;
}

/**
 * Look up a sport on a registry. Throws if the sport is not configured —
 * loud failure beats silently rendering an empty class grid.
 */
export function getSport(registry: Registry, sportId: string): RegistrySport {
  const sport = registry.sports[sportId];
  if (!sport) {
    throw new Error(`Sport "${sportId}" is not configured for registry "${registry.id}"`);
  }
  return sport;
}

export type {
  Registry,
  RegistryId,
  RegistrySport,
  RegistryDogFields,
  RegistryRegistrationField,
} from './types';
export { akcRegistry, AKC_EXHIBITOR_AGREEMENT } from './akc';
export { getShowLandingStyle, getTrialRegistry, getTrialTimezone } from './helpers';
export type { LandingStyle } from './helpers';
