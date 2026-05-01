import { useMemo } from 'react';
import { useShowRegistrationStore } from '@/store/showRegistrationStore';
import { selectRegistrationsByShow } from '@/store/showRegistrationSelectors';

interface ExistingEntry {
  dogId: string;
  classId: string;
  registrationId: string;
  status: string;
  entryStatus?: string;
}

export function useExistingEntries(showId: string) {
  const allRegistrations = useShowRegistrationStore(state => state.registrations);

  const existingEntries = useMemo(() => {
    const registrations = selectRegistrationsByShow(
      {
        registrations: allRegistrations,
        currentRegistration: null,
        draftData: {},
        registrationContext: null,
      },
      showId
    );
    const entries: ExistingEntry[] = [];

    registrations.forEach(registration => {
      if (registration.status === 'cancelled') return;

      registration.entries?.forEach(entry => {
        entry.classes?.forEach(classEntry => {
          entries.push({
            dogId: entry.dogId,
            classId: classEntry.classId,
            registrationId: registration.id,
            status: registration.status,
            ...(registration.entryStatus !== undefined && {
              entryStatus: registration.entryStatus,
            }),
          });
        });
      });
    });

    return entries;
  }, [showId, allRegistrations]);

  const checkIfDogEnteredInClass = (dogId: string, classId: string): boolean => {
    return existingEntries.some(entry => entry.dogId === dogId && entry.classId === classId);
  };

  const getExistingEntry = (dogId: string, classId: string): ExistingEntry | undefined => {
    return existingEntries.find(entry => entry.dogId === dogId && entry.classId === classId);
  };

  const getEntriesForDog = (dogId: string): ExistingEntry[] => {
    return existingEntries.filter(entry => entry.dogId === dogId);
  };

  return {
    existingEntries,
    checkIfDogEnteredInClass,
    getExistingEntry,
    getEntriesForDog,
  };
}
