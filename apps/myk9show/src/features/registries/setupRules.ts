/** Judge setup cheat sheet data (MYK9-1078): one lookup for every registry that has a card. */

import { akcSetupSheet } from './akcSetupRules';
import { getRegistry } from './lookup';
import type { RegistryId } from './types';
import { ukcSetupSheet } from './ukcSetupRules';
import { getSetupValue, type SetupSheet } from './setupRules.types';

/** The setup sheet for a registry, or null when none is printed for it (ASCA today). */
export function getSetupSheet(
  registryId: RegistryId | string | null | undefined
): SetupSheet | null {
  if (registryId === 'UKC') return ukcSetupSheet;
  if (registryId === 'AKC') return akcSetupSheet;
  return null;
}

/**
 * The printed "Search area" cell for a class (MYK9-1738), so ringside and the secretary panel
 * show exactly what the cheat sheet prints. Takes the class's own labels ("Handler
 * Discrimination", "Novice A") and returns null when the sheet has no size for it (ASCA,
 * UKC Vehicle, AKC Detective).
 */
export function getSearchAreaSize(
  organization: string | null | undefined,
  element: string | null | undefined,
  level: string | null | undefined
): string | null {
  const sheet = getSetupSheet(organization?.trim().toUpperCase());
  if (!sheet || !element || !level) return null;
  const wanted = element.trim().toLowerCase();
  const elementKey = getRegistry(sheet.registryId).sports['scent-work']?.elements.find(
    e => e.key === wanted || e.label.toLowerCase() === wanted
  )?.key;
  // A class level may carry its Novice A/B section; the sheet's columns are levels only.
  const levelKey = level
    .trim()
    .toLowerCase()
    .replace(/\s+[ab]$/, '');
  if (!elementKey) return null;
  return getSetupValue(sheet, elementKey, 'area', levelKey) ?? null;
}

export { akcSetupSheet, ukcSetupSheet };
export { getSetupValue };
export type {
  SetupElementGroup,
  SetupExcerpt,
  SetupLevelColumn,
  SetupNote,
  SetupPage,
  SetupRow,
  SetupSheet,
} from './setupRules.types';
