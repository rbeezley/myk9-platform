export const AKC_SCENT_WORK_ELEMENTS = [
  'Container',
  'Interior',
  'Exterior',
  'Buried',
  'Handler Discrimination',
  'Detective',
] as const;

export type AkcScentWorkElement = (typeof AKC_SCENT_WORK_ELEMENTS)[number];

export interface GridCell {
  checkedLevels: Set<string>;
  noviceClass: 'A' | 'B' | null;
}

export interface EntryFormTrial {
  id: string;
  date: string;
  trialNumber: number;
}

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

export interface EntryFormRegistration {
  registeredName: string;
  registrationNumber: string;
  organization: string;
  variety: string | null;
}

export interface EntryFormPerson {
  firstName: string;
  lastName: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  email: string;
}

export interface EntryFormDog {
  dogId: string;
  callName: string;
  breed: string;
  sex: string;
  dateOfBirth: string;
  registration: EntryFormRegistration | null;
  breeder: string | null;
  sire: string | null;
  dam: string | null;
  owner: EntryFormPerson;
  handler: EntryFormPerson | null;
  armband: number | null;
  entries: EntryFormEntry[];
  agreementDate: string | null;
}
