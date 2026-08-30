/**
 * Registry config — public API.
 *
 * Usage:
 *   import { getRegistry, getSport } from '@/features/registries';
 *   const akc = getRegistry('AKC');
 *   const scentWork = getSport(akc, 'scent-work');
 */

export { listRegistries, getRegistry, getSport } from './lookup';

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
  deriveRegistryId,
  resolveConfiguredRegistryId,
} from './helpers';
export type { ShowStyle } from './helpers';
