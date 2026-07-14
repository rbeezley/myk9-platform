import { useEffect, useMemo, useState } from 'react';
import { useShowRegistrationStore } from '@/store/showRegistrationStore';
import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import { isActiveSubmittedEntryStatus } from '@/services/entryDisplay/entryDisplaySelectors';

interface ExistingEntry {
  dogId: string;
  classId: string;
  registrationId: string;
  status: string;
  entryStatus?: string;
  paymentStatus?: string;
}

interface ExistingEntryRow {
  id: string;
  dog_id: string | null;
  class_id: string | null;
  registration_id: string | null;
  entry_status: string | null;
  check_in_status: string | null;
  payment_status: string | null;
}

const blocksClassReEntry = (
  entryStatus: string | null | undefined,
  checkInStatus?: string | null | undefined
) => isActiveSubmittedEntryStatus(entryStatus ?? 'submitted', checkInStatus);

export function useExistingEntries(showId: string) {
  const allRegistrations = useShowRegistrationStore(state => state.registrations);
  const [serverEntries, setServerEntries] = useState<ExistingEntry[]>([]);

  useEffect(() => {
    let isActive = true;

    const loadServerEntries = async () => {
      if (!showId) {
        setServerEntries([]);
        return;
      }

      const { data, error } = await supabase
        .from('entries')
        .select('id, dog_id, class_id, registration_id, entry_status, check_in_status, payment_status')
        .eq('show_id', showId)
        .is('deleted_at', null);

      if (!isActive) return;

      if (error) {
        logger.warn(
          'Error loading existing entries for class selection',
          'registration',
          { showId },
          error
        );
        setServerEntries([]);
        return;
      }

      setServerEntries(
        ((data || []) as ExistingEntryRow[])
          .filter(entry => entry.dog_id && entry.class_id)
          .filter(entry => blocksClassReEntry(entry.entry_status, entry.check_in_status))
          .map(entry => ({
            dogId: entry.dog_id!,
            classId: entry.class_id!,
            registrationId: entry.registration_id ?? entry.id,
            status: entry.entry_status ?? 'submitted',
            ...(entry.entry_status !== null && { entryStatus: entry.entry_status }),
            ...(entry.payment_status !== null && { paymentStatus: entry.payment_status }),
          }))
      );
    };

    void loadServerEntries();

    return () => {
      isActive = false;
    };
  }, [showId]);

  const existingEntries = useMemo(() => {
    const registrations = allRegistrations.filter(r => r.showId === showId);
    const entries: ExistingEntry[] = [];

    registrations.forEach(registration => {
      if (registration.status === 'cancelled') return;
      if (!blocksClassReEntry(registration.entryStatus ?? registration.status)) return;

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

    const keys = new Set(entries.map(entry => `${entry.dogId}:${entry.classId}`));
    for (const entry of serverEntries) {
      const key = `${entry.dogId}:${entry.classId}`;
      if (!keys.has(key)) {
        entries.push(entry);
        keys.add(key);
      }
    }

    return entries;
  }, [showId, allRegistrations, serverEntries]);

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
