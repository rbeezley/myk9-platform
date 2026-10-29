/** Judge setup cheat sheet data (MYK9-1078): one lookup for every registry that has a card. */

import { akcSetupSheet } from './akcSetupRules';
import type { RegistryId } from './types';
import { ukcSetupSheet } from './ukcSetupRules';
import type { SetupSheet } from './setupRules.types';

/** The setup sheet for a registry, or null when none is printed for it (ASCA today). */
export function getSetupSheet(
  registryId: RegistryId | string | null | undefined
): SetupSheet | null {
  if (registryId === 'UKC') return ukcSetupSheet;
  if (registryId === 'AKC') return akcSetupSheet;
  return null;
}

export { akcSetupSheet, ukcSetupSheet };
export { getSetupValue } from './setupRules.types';
export type {
  SetupElementGroup,
  SetupLevelColumn,
  SetupNote,
  SetupPage,
  SetupRow,
  SetupSheet,
} from './setupRules.types';
