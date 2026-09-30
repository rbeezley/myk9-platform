import type { TabValue } from './types';

interface FieldLocation {
  tab: TabValue;
  /** DOM id to focus once the tab is showing; absent when no single control owns the field. */
  elementId?: string;
}

/**
 * MYK9-885: the Add Dog footer error summary names fields (call name, sex, date
 * of birth) that live on the Essential tab. A user sitting on the Registration
 * tab saw the list with no field in sight. Maps a failing schema field to the
 * tab that renders it, plus the DOM id to focus once that tab is showing.
 */
const FIELD_LOCATION: Record<string, FieldLocation> = {
  callName: { tab: 'basic', elementId: 'callName' },
  gender: { tab: 'basic', elementId: 'gender' },
  dateOfBirth: { tab: 'basic', elementId: 'dateOfBirth' },
  ownerId: { tab: 'basic', elementId: 'owner' },
  imageUrl: { tab: 'basic' },
  registrations: { tab: 'registration' },
  color: { tab: 'optional', elementId: 'color' },
  height: { tab: 'optional', elementId: 'height' },
  weight: { tab: 'optional', elementId: 'weight' },
  microchip: { tab: 'optional', elementId: 'microchip' },
  spayedNeutered: { tab: 'optional', elementId: 'spayedNeutered' },
};

export const locateInvalidField = (field: string): FieldLocation | undefined =>
  FIELD_LOCATION[field];
