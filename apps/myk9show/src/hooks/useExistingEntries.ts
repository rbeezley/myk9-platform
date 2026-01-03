import { useMemo } from 'react';
import { useShowRegistrationStore } from '@/store/showRegistrationStore';

interface ExistingEntry {
  dogId: string;
  classId: string;
  registrationId: string;
  status: string;
  entryStatus?: string;
}

export function useExistingEntries(showId: string) {
  const { getRegistrationsByShow } = useShowRegistrationStore();
  
  const existingEntries = useMemo(() => {
    const registrations = getRegistrationsByShow(showId);
    const entries: ExistingEntry[] = [];
    
    // Collect all existing entries for this show
    registrations.forEach(registration => {
      // Skip cancelled registrations
      if (registration.status === 'cancelled') return;
      
      registration.entries?.forEach(entry => {
        entry.classes?.forEach(classEntry => {
          entries.push({
            dogId: entry.dogId,
            classId: classEntry.classId,
            registrationId: registration.id,
            status: registration.status,
            entryStatus: registration.entryStatus
          });
        });
      });
    });
    
    return entries;
  }, [showId, getRegistrationsByShow]);
  
  const checkIfDogEnteredInClass = (dogId: string, classId: string): boolean => {
    return existingEntries.some(
      entry => entry.dogId === dogId && entry.classId === classId
    );
  };
  
  const getExistingEntry = (dogId: string, classId: string): ExistingEntry | undefined => {
    return existingEntries.find(
      entry => entry.dogId === dogId && entry.classId === classId
    );
  };
  
  const getEntriesForDog = (dogId: string): ExistingEntry[] => {
    return existingEntries.filter(entry => entry.dogId === dogId);
  };
  
  return {
    existingEntries,
    checkIfDogEnteredInClass,
    getExistingEntry,
    getEntriesForDog
  };
}