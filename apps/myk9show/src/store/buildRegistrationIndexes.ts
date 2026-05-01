import type { ShowRegistration, ShowEntry, ClassEntry } from '../types/show-registration-types';

export const compareById = (a: { id: string }, b: { id: string }): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export type StoredShowRegistration = Omit<ShowRegistration, 'entries'>;
export type StoredShowEntry = Omit<ShowEntry, 'classes'>;

export interface RegistrationIndexes {
  registrationsById: Record<string, StoredShowRegistration>;
  entriesById: Record<string, StoredShowEntry>;
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
    const { entries, ...regWithoutEntries } = registration;
    indexes.registrationsById[registration.id] = regWithoutEntries;
    for (const entry of entries ?? []) {
      const { classes, ...entryWithoutClasses } = entry;
      indexes.entriesById[entry.id] = entryWithoutClasses;
      for (const cls of classes ?? []) {
        indexes.classesById[cls.id] = cls;
      }
    }
  }

  return indexes;
};

// Reassembles a full ShowRegistration from the flat byId indexes.
// Entry order is stable: IDs are Date.now()-prefixed so lexicographic = insertion order.
export const reassembleRegistration = (
  reg: StoredShowRegistration,
  entriesById: Record<string, StoredShowEntry>,
  classesById: Record<string, ClassEntry>
): ShowRegistration => ({
  ...reg,
  entries: Object.values(entriesById)
    .filter(e => e.registrationId === reg.id)
    .sort(compareById)
    .map(e => ({
      ...e,
      classes: Object.values(classesById).filter(c => c.entryId === e.id),
    })),
});
