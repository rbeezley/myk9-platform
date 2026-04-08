/**
 * Types for the AKC Scent Work entry form generation.
 * These represent the joined data needed to populate one entry form per dog.
 */

/** Secretary info for the form header "Entries should be sent to" block */
export interface EntryFormSecretary {
  name: string;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}

/** A trial row in the class selection grid */
export interface EntryFormTrial {
  id: string;
  date: string;
  trialNumber: number;
}

/** A class offered at the show (used to build the grid columns) */
export interface EntryFormClass {
  id: string;
  trialId: string;
  element: string;
  level: string;
}

/** A single entry for a dog in one class */
export interface EntryFormEntry {
  id: string;
  trialId: string;
  classId: string;
  element: string;
  level: string;
  armband: number | null;
  handler: string | null;
  submittedAt: string | null;
}

/** Dog registration info from dog_registrations table */
export interface EntryFormRegistration {
  registeredName: string | null;
  registrationNumber: string;
  organization: string;
  variety: string | null;
}

/** Owner/person info */
export interface EntryFormPerson {
  firstName: string | null;
  lastName: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
  email: string | null;
}

/** One dog's complete data for a single entry form page */
export interface EntryFormDog {
  dogId: string;
  callName: string;
  breed: string;
  sex: string | null;
  dateOfBirth: string | null;
  registration: EntryFormRegistration | null;
  breeder: string | null;
  sire: string | null;
  dam: string | null;
  owner: EntryFormPerson;
  handler: string | null;
  armband: number | null;
  entries: EntryFormEntry[];
  agreementDate: string | null;
}

/** The AKC Scent Work element columns in the class grid */
export const AKC_SCENT_WORK_ELEMENTS = [
  'Container',
  'Interior',
  'Exterior',
  'Buried',
  'Handler Discrimination',
  'Detective',
] as const;

export type AKCScentWorkElement = (typeof AKC_SCENT_WORK_ELEMENTS)[number];

/** The AKC Scent Work level rows within each element cell */
export const AKC_SCENT_WORK_LEVELS = ['Novice', 'Advanced', 'Excellent', 'Master'] as const;

export type AKCScentWorkLevel = (typeof AKC_SCENT_WORK_LEVELS)[number];

/** Column header abbreviations matching the official form */
export const ELEMENT_COLUMN_HEADERS: Record<AKCScentWorkElement, string> = {
  Container: 'Cont.',
  Interior: 'Int.',
  Exterior: 'Ext.',
  Buried: 'Buried',
  'Handler Discrimination': 'Handler Disc.',
  Detective: 'Det.',
};

/** A single cell in the class grid: which levels are checked for this trial+element */
export interface GridCell {
  checkedLevels: Set<string>;
  noviceClass: 'A' | 'B' | null;
}
