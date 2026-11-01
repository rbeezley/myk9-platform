/**
 * Registry config — public API.
 *
 * Usage:
 *   import { getRegistry, getSport } from '@/features/registries';
 *   const akc = getRegistry('AKC');
 *   const scentWork = getSport(akc, 'scent-work');
 */

export { listRegistries, getRegistry, getSport, getRegistrySportName } from './lookup';

export type {
  Registry,
  RegistryId,
  RegistrySport,
  RegistryDogFields,
  RegistryRegistrationField,
  LevelSpec,
  ElementSpec,
  ClassVariant,
  ClassVariantKind,
} from './types';
export { akcRegistry, AKC_EXHIBITOR_AGREEMENT } from './akc';
export { ukcRegistry, UKC_EXHIBITOR_AGREEMENT } from './ukc';
export { ascaRegistry, ASCA_EXHIBITOR_AGREEMENT } from './asca';
export {
  getShowStyle,
  getTrialRegistry,
  getTrialTimezone,
  resolveBrowserTrialTimezone,
  deriveRegistryId,
  resolveConfiguredRegistryId,
} from './helpers';
export type { ShowStyle } from './helpers';

// MYK9-632: Withdraw vs Pull. Rulebook facts, per registry.
export {
  WITHDRAWAL_REASON_CODES,
  getWithdrawalPolicy,
  getWithdrawalReason,
  isWithdrawalReasonCode,
  withdrawalReasonLabel,
} from './withdrawalPolicy';
export type {
  RegistryWithdrawalPolicy,
  RemoveFromClassKind,
  WithdrawalReasonCode,
  WithdrawalReasonSpec,
} from './withdrawalPolicy';

// MYK9-1078: judge setup cheat sheet data (UKC Nosework, AKC Scent Work).
export { getSetupSheet, getSetupValue, akcSetupSheet, ukcSetupSheet } from './setupRules';
export type {
  SetupElementGroup,
  SetupExcerpt,
  SetupLevelColumn,
  SetupNote,
  SetupPage,
  SetupRow,
  SetupSheet,
} from './setupRules';
