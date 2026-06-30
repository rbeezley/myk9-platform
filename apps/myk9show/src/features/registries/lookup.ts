/**
 * Registry/sport lookup functions.
 *
 * Kept in a leaf module (no imports from the `./index` barrel) so that
 * `helpers.ts` can depend on `getRegistry` without forming a circular
 * dependency with the barrel. The barrel re-exports everything here.
 */

import { akcRegistry } from './akc';
import { ukcRegistry } from './ukc';
import type { Registry, RegistryId, RegistrySport } from './types';

const REGISTRIES: Readonly<Record<RegistryId, Registry>> = {
  AKC: akcRegistry,
  UKC: ukcRegistry,
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
