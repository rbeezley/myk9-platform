import type { PageEntry } from '../types';

export interface RouteDiffResult {
  /** Routes present in the registry but missing from the directory */
  missing: string[];
  /** Entries in the directory that point to routes no longer in the registry */
  extra: string[];
}

export function routeDiff(
  registry: Record<string, unknown>,
  directory: readonly PageEntry[]
): RouteDiffResult {
  const registryPaths = new Set(Object.keys(registry));
  const directoryPaths = new Set(directory.map(e => e.path));

  const missing = [...registryPaths].filter(p => !directoryPaths.has(p)).sort();
  const extra = [...directoryPaths].filter(p => !registryPaths.has(p)).sort();

  return { missing, extra };
}
