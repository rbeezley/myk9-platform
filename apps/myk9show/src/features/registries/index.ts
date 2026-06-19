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
} from './types';
export { akcRegistry, AKC_EXHIBITOR_AGREEMENT } from './akc';
export { getShowStyle, getShowLandingStyle, getTrialRegistry, getTrialTimezone } from './helpers';
export type { ShowStyle, LandingStyle } from './helpers';
