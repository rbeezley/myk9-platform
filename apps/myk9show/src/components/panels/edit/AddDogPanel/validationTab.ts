import type { TabValue } from './types';
import type { FieldLocation } from '../usePanelValidationNavigation';

/**
 * MYK9-885: the Add Dog footer error summary names fields (call name, sex, date
 * of birth) that live on the Essential tab. A user sitting on the Registration
 * tab saw the list with no field in sight. Maps a failing schema field to the
 * tab that renders it, plus the DOM id to focus once that tab is showing.
 */
export const REGISTRATION_HEADING_ID = 'registration-tab-heading';

const FIELD_LOCATION: Record<string, FieldLocation<TabValue>> = {
  callName: { tab: 'basic', elementId: 'callName' },
  gender: { tab: 'basic', elementId: 'gender' },
  dateOfBirth: { tab: 'basic', elementId: 'dateOfBirth' },
  ownerId: { tab: 'basic', elementId: 'owner' },
  imageUrl: { tab: 'basic', elementId: 'dog-photo-button' },
  registrations: { tab: 'registration', elementId: REGISTRATION_HEADING_ID },
  color: { tab: 'optional', elementId: 'color' },
  height: { tab: 'optional', elementId: 'height' },
  weight: { tab: 'optional', elementId: 'weight' },
  microchip: { tab: 'optional', elementId: 'microchip' },
  spayedNeutered: { tab: 'optional', elementId: 'spayedNeutered' },
};

export const locateInvalidField = (field: string): FieldLocation<TabValue> | undefined =>
  FIELD_LOCATION[field];
