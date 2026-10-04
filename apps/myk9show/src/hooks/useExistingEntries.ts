import { useEffect, useMemo, useState } from 'react';
import { useShowRegistrationStore } from '@/store/showRegistrationStore';
import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import {
  classReEntryReason,
  getClassReEntryBlock,
  strongestClassReEntryBlock,
  type ClassReEntryBlock,
} from '@/services/entryDisplay/classReEntry';

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

export function useExistingEntries(showId: string) {
  const allRegistrations = useShowRegistrationStore(state => state.registrations);
  const [serverEntries, setServerEntries] = useState<ExistingEntry[]>([]);
  // Ended rows (withdrawn, pulled, ...) by `dogId:classId`. They do not count as
  // "already entered", but the same rule that removes them from the cart keeps
  // the class step from offering them again (MYK9-982).
  const [serverEndedBlocks, setServerEndedBlocks] = useState<Map<string, ClassReEntryBlock>>(
    () => new Map()
  );

  useEffect(() => {
    let isActive = true;

    const loadServerEntries = async () => {
      if (!showId) {
        setServerEntries([]);
        setServerEndedBlocks(new Map());
        return;
      }

      const { data, error } = await supabase
        .from('entries')
        .select(
          'id, dog_id, class_id, registration_id, entry_status, check_in_status, payment_status'
        )
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
        setServerEndedBlocks(new Map());
        return;
      }

      const rows = ((data || []) as ExistingEntryRow[]).filter(
        entry => entry.dog_id && entry.class_id
      );
      const endedByPair = new Map<string, ClassReEntryBlock[]>();
      for (const entry of rows) {
        const block = getClassReEntryBlock(entry.entry_status, entry.check_in_status);
        if (block === 'entered') continue;
        const key = `${entry.dog_id}:${entry.class_id}`;
        endedByPair.set(key, [...(endedByPair.get(key) ?? []), block]);
      }
      setServerEndedBlocks(
        new Map(
          [...endedByPair].flatMap(([key, blocks]) => {
            const strongest = strongestClassReEntryBlock(blocks);
            return strongest ? [[key, strongest] as const] : [];
          })
        )
      );

      setServerEntries(
        rows
          .filter(
            entry => getClassReEntryBlock(entry.entry_status, entry.check_in_status) === 'entered'
          )
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
      if (getClassReEntryBlock(registration.entryStatus ?? registration.status) !== 'entered') {
        return;
      }

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

  /**
   * Why this dog cannot be entered in this class online, when it has an ended
   * row there and no live one. `null` means selectable as far as this rule goes.
   */
  const getReEntryBlockReason = (dogId: string, classId: string): string | null => {
    if (checkIfDogEnteredInClass(dogId, classId)) return null;
    const block = serverEndedBlocks.get(`${dogId}:${classId}`);
    return block ? classReEntryReason(block) : null;
  };

  const getEntriesForDog = (dogId: string): ExistingEntry[] => {
    return existingEntries.filter(entry => entry.dogId === dogId);
  };

  return {
    existingEntries,
    checkIfDogEnteredInClass,
    getExistingEntry,
    getEntriesForDog,
    getReEntryBlockReason,
  };
}
