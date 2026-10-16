import type { TabValue } from './types';
import type { FieldLocation } from '../usePanelValidationNavigation';

/**
 * MYK9-885: the Add Dog footer error summary names fields (call name, sex, date
 * of birth) that live on the Essential tab. A user sitting on the Registration
 * tab saw the list with no field in sight. Maps a failing schema field to the
 * tab that renders it, plus the DOM id to focus once that tab is showing.
 */
export const REGISTRATION_HEADING_ID = 'registration-tab-heading';

/**
 * Where focus returns when the inline registration sub-mode closes (MYK9-1081):
 * the row's Edit button after an Edit (EDIT_REGISTRATION_ATTR lives in
 * components/dogs/registrationAttrs.ts), "Add New Registration" after an Add.
 */
export const ADD_REGISTRATION_ATTR = 'data-add-registration';

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

/** Tab order and names for the Add Dog "Next: <tab>" walk (matches TabNavigation). */
export const DOG_STEP_TABS: ReadonlyArray<{ value: TabValue; label: string }> = [
  { value: 'registration', label: 'Registration' },
  { value: 'basic', label: 'Essential' },
  { value: 'optional', label: 'Optional details' },
];
