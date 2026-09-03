/**
 * Formatter registry — maps (organization, sportType) to a ResultFormatter.
 *
 * Usage:
 *   registerFormatter(AKCScentWorkFormatter);
 *   const formatters = listFormatters();
 */

import type { ResultFormatter } from './types';

const registry = new Map<string, ResultFormatter>();

function makeKey(organization: string, sportType: string): string {
  return `${organization.toUpperCase()}:${sportType.toLowerCase()}`;
}

/**
 * Register a formatter. Overwrites any existing formatter for the same
 * (organization, sportType) pair.
 */
export function registerFormatter(formatter: ResultFormatter): void {
  const key = makeKey(formatter.organization, formatter.sportType);
  registry.set(key, formatter);
}

/**
 * Return all registered formatters, sorted by organization then sport type.
 */
export function listFormatters(): ResultFormatter[] {
  return Array.from(registry.values()).sort((a, b) => {
    const orgCmp = a.organization.localeCompare(b.organization);
    return orgCmp !== 0 ? orgCmp : a.sportType.localeCompare(b.sportType);
  });
}
