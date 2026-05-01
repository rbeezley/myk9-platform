import type { ShowRegistration, ShowEntry, ClassEntry } from '../types/show-registration-types';

export interface RegistrationIndexes {
  registrationsById: Record<string, ShowRegistration>;
  entriesById: Record<string, ShowEntry>;
  classesById: Record<string, ClassEntry>;
}

export const emptyRegistrationIndexes = (): RegistrationIndexes => ({
  registrationsById: {},
  entriesById: {},
  classesById: {},
});

export const buildRegistrationIndexes = (
  registrations: ShowRegistration[] | null | undefined
): RegistrationIndexes => {
  const indexes = emptyRegistrationIndexes();
  if (!registrations) return indexes;

  for (const registration of registrations) {
    indexes.registrationsById[registration.id] = registration;
    for (const entry of registration.entries ?? []) {
      indexes.entriesById[entry.id] = entry;
      for (const cls of entry.classes ?? []) {
        indexes.classesById[cls.id] = cls;
      }
    }
  }

  return indexes;
};
