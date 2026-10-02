import type { FieldLocation } from './usePanelValidationNavigation';

export type UserTabValue = 'basic' | 'contact' | 'qualifications' | 'availability';

/** Tabs of the create walk: a person has no judge tabs until it is a judge. */
export const USER_CREATE_TABS: ReadonlyArray<{ value: UserTabValue; label: string }> = [
  { value: 'basic', label: 'Basic Info' },
  { value: 'contact', label: 'Contact' },
];

/** Field -> tab + element to focus, for error routing and the Next check (MYK9-931). */
const FIELD_LOCATION: Record<string, FieldLocation<UserTabValue>> = {
  firstName: { tab: 'basic', elementId: 'firstName' },
  lastName: { tab: 'basic', elementId: 'lastName' },
  email: { tab: 'basic', elementId: 'email' },
  dateOfBirth: { tab: 'basic', elementId: 'user-edit-date-of-birth' },
  juniorHandlerNumbers: { tab: 'basic', elementId: 'user-edit-date-of-birth' },
  bio: { tab: 'basic', elementId: 'bio' },
  profileImage: { tab: 'basic', elementId: 'firstName' },
  phone: { tab: 'contact', elementId: 'phone' },
  address: { tab: 'contact', elementId: 'address' },
  city: { tab: 'contact', elementId: 'city' },
  state: { tab: 'contact', elementId: 'state' },
  zipCode: { tab: 'contact', elementId: 'zipCode' },
  emergencyContact: { tab: 'contact', elementId: 'emergencyContact' },
  emergencyPhone: { tab: 'contact', elementId: 'emergencyPhone' },
  judgeQualifications: { tab: 'qualifications', elementId: 'person-qualifications-heading' },
};

export const locateUserField = (field: string): FieldLocation<UserTabValue> | undefined =>
  FIELD_LOCATION[field];
