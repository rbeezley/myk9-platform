/**
 * Day-of Entry Queries
 *
 * Database queries for day-of-show entry operations:
 * - Class capacity checking
 * - Walk-in registration (day-of entries)
 * - Show dog lookup
 * - Dog search for new entries
 *
 * Note: Each row in the entries table represents one dog's entry into one class.
 */

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import {
  replicatedClassesTable,
  replicatedDogsTable,
  replicatedEntriesTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { generateUUID } from '@/utils/idUtils';
import type { DayOfEntry } from './types';

function isNotDeleted(row: {
  deletedAt?: string | null | undefined;
  deleted_at?: string | null | undefined;
}) {
  return !row.deletedAt && !row.deleted_at;
}

function isActiveDog(dog: { status?: string | null | undefined }) {
  return !dog.status || dog.status === 'active';
}

/**
 * Get classes with available capacity for day-of entries
 */
export const getClassesWithCapacity = async (showId: string) => {
  const startTime = Date.now();

  try {
    const trials = await replicatedTrialsTable.getTrialsByShow(showId);
    const trialIds = trials.map(t => t.id);

    if (trialIds.length === 0) {
      return { data: [], error: null };
    }

    const [classesByTrial, showEntries] = await Promise.all([
      Promise.all(trialIds.map(trialId => replicatedClassesTable.getClassesByTrial(trialId))),
      replicatedEntriesTable.getEntriesByShow(showId),
    ]);
    const classes = classesByTrial.flat().filter(isNotDeleted);
    const activeShowEntries = showEntries.filter(isNotDeleted);

    const classesWithCapacity = classes
      .map(cls => {
        const classNumber =
          (cls as { class_number?: string | null; classNumber?: string | null }).class_number ??
          (cls as { classNumber?: string | null }).classNumber ??
          null;
        const trialId = cls.trialId ?? cls.trial_id;
        const accepted = activeShowEntries.filter(entry => {
          const entryClassId = entry.classId ?? entry.class_id;
          const status = entry.entryStatus ?? entry.entry_status;
          return entryClassId === cls.id && (status === 'confirmed' || status === 'checked-in');
        }).length;
        const limit = cls.maxEntries ?? 999;

        return {
          id: cls.id,
          name: cls.name,
          class_number: classNumber,
          max_entries: cls.maxEntries ?? null,
          trial_id: trialId ?? '',
          accepted_count: accepted,
          available_spots: Math.max(0, limit - accepted),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const duration = Date.now() - startTime;
    logQuery('classes', 'get_classes_with_capacity', duration);

    return { data: classesWithCapacity, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'classes', 'get_classes_with_capacity');
    logQuery('classes', 'get_classes_with_capacity', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Create a day-of entry (walk-in registration)
 * Creates one entry row per class (since each entry = one dog in one class)
 */
export const createDayOfEntry = async (entryData: DayOfEntry, userId: string) => {
  const startTime = Date.now();

  try {
    const armbandRows = await replicatedEntriesTable.getEntriesByShow(entryData.showId);
    // INTENT: Walk-in armband assignment is local-first so secretaries can keep
    // entering dogs offline. An incomplete replica or concurrent device can
    // collide; sync/reconciliation remains the launch-readiness hardening gap.
    let nextArmband = 1;
    if (armbandRows && armbandRows.length > 0) {
      const maxParsed = armbandRows
        .map(r => parseInt(r.armband ?? '', 10))
        .filter(n => !isNaN(n))
        .reduce((max, n) => (n > max ? n : max), 0);
      if (maxParsed > 0) nextArmband = maxParsed + 1;
    }

    const classData = await Promise.all(
      entryData.classIds.map(async classId => {
        const cls = await replicatedClassesTable.getClassById(classId);
        if (!cls) {
          throw createDatabaseError(
            new Error(`Class ${classId} not found`),
            'classes',
            'create_day_of_entry_class_lookup'
          );
        }
        return cls;
      })
    );

    const classInfoMap = new Map(
      classData.map(c => [
        c.id,
        {
          trial_id: c.trialId ?? c.trial_id,
          entry_fee: c.entryFee,
        },
      ])
    );

    // Calculate total fees
    const defaultFee = 35;
    const totalFees = entryData.classIds.reduce((sum: number, classId: string) => {
      const info = classInfoMap.get(classId);
      return sum + (info?.entry_fee || defaultFee);
    }, 0);

    // Create one entry per class (entries table has one row per class entry)
    const entries = entryData.classIds.map((classId: string, index: number) => {
      const classInfo = classInfoMap.get(classId);
      return {
        id: generateUUID(),
        dogId: entryData.dogId,
        showId: entryData.showId,
        classId,
        ...(classInfo?.trial_id !== undefined && { trialId: classInfo.trial_id }),
        ...(classInfo?.trial_id !== undefined && { trial_id: classInfo.trial_id }),
        handler: entryData.handler,
        handlerId: userId,
        isDayOfShow: true,
        paymentMethod: entryData.paymentMethod,
        paymentStatus: entryData.paymentMethod === 'waived' ? 'waived' : 'paid',
        entryStatus: 'confirmed',
        entry_status: 'confirmed',
        entryFee: entryData.paymentMethod === 'waived' ? 0 : classInfo?.entry_fee || defaultFee,
        armband: String(nextArmband), // Same armband for all classes (same dog/handler)
        jumpHeight: entryData.jumpHeight || undefined,
        specialRequests: index === 0 ? entryData.notes || null : null, // Only on first entry
        special_requests: index === 0 ? entryData.notes || null : null,
        submittedAt: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    const createdEntries = await Promise.all(
      entries.map(entry => replicatedEntriesTable.createEntry(entry))
    );

    const duration = Date.now() - startTime;
    logQuery('entries', 'create_day_of_entry', duration);

    return {
      data: {
        entries: createdEntries,
        armbandNumber: nextArmband,
        classCount: entryData.classIds.length,
        totalFees: entryData.paymentMethod === 'waived' ? 0 : totalFees,
      },
      error: null,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'create_day_of_entry');
    logQuery('entries', 'create_day_of_entry', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Get dogs registered for the show (for day-of entry dog selector)
 */
export const getShowDogs = async (showId: string) => {
  const startTime = Date.now();

  try {
    // Get dogs that already have entries in this show
    const { data: existingEntries, error: entriesError } = await supabase
      .from('entries')
      .select(
        `
        dog_id,
        dog:dog_id (
          id,
          name,
          call_name,
          breed
        )
      `
      )
      .eq('show_id', showId)
      .is('deleted_at', null);

    if (entriesError) {
      throw createDatabaseError(entriesError, 'entries', 'get_show_dogs');
    }

    // Get unique dogs
    const dogMap = new Map();
    existingEntries?.forEach(entry => {
      if (entry.dog && !dogMap.has(entry.dog_id)) {
        dogMap.set(entry.dog_id, entry.dog);
      }
    });

    const duration = Date.now() - startTime;
    logQuery('entries', 'get_show_dogs', duration);

    return { data: Array.from(dogMap.values()), error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'get_show_dogs');
    logQuery('entries', 'get_show_dogs', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Search all dogs (for adding new entries)
 */
export const searchDogs = async (searchTerm: string) => {
  const startTime = Date.now();

  try {
    const dogs = await replicatedDogsTable.searchDogs(searchTerm);
    const data = dogs
      .filter(dog => isActiveDog(dog) && isNotDeleted(dog))
      .slice(0, 20)
      .map(dog => ({
        id: dog.id,
        name: dog.name,
        call_name: dog.callName ?? null,
        breed: dog.breed ?? null,
        owner: null,
      }));

    const duration = Date.now() - startTime;
    logQuery('dogs', 'search_dogs', duration);

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dogs', 'search_dogs');
    logQuery('dogs', 'search_dogs', duration, dbError.message);
    return { data: [], error: dbError };
  }
};
