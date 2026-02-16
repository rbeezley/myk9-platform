import type { Dog, Registration } from '@/types/dog-types';
import type { User } from '@/types/user-types';
import type { Show } from '@/types/show-types';
import { useDogStore } from '@/store/dogStore';
import { useEntryStore, type SyncableShowEntry } from '@/store/entryStore';
import { useShowStore } from '@/store/showStore';
import { useUserStore } from '@/store/userStore';
import { useRegistrationsStore } from '@/store/registrationsStore';
import { logger } from '@/services/LoggingService';
import type { ExportDataSet, ImportOptions, ImportResult } from './data-export-import-types';

/**
 * Import records of a specific type into the corresponding store.
 */
function importByType(
  dataType: string,
  records: unknown[],
  mergeStrategy: ImportOptions['mergeStrategy']
): { imported: number; skipped: number; failed: number; errors: string[] } {
  const result = { imported: 0, skipped: 0, failed: 0, errors: [] as string[] };

  switch (dataType) {
    case 'shows': {
      const showStore = useShowStore.getState();
      const existingIds = new Set(showStore.shows.map(s => s.id));
      const typedRecords = records as Show[];

      if (mergeStrategy === 'replace') {
        showStore.setShows(typedRecords);
        result.imported = typedRecords.length;
      } else {
        for (const record of typedRecords) {
          if (existingIds.has(record.id)) {
            if (mergeStrategy === 'skip') {
              result.skipped++;
            } else {
              // merge: update existing record
              const updated = showStore.shows.map(s => s.id === record.id ? { ...s, ...record } : s);
              showStore.setShows(updated);
              result.imported++;
            }
          } else {
            showStore.setShows([...showStore.shows, record]);
            result.imported++;
          }
        }
      }
      break;
    }

    case 'dogs': {
      const dogStore = useDogStore.getState();
      const existingIds = new Set(dogStore.dogs.map(d => d.id));
      const typedRecords = records as Dog[];

      if (mergeStrategy === 'replace') {
        dogStore.setDogs(typedRecords);
        result.imported = typedRecords.length;
      } else {
        for (const record of typedRecords) {
          if (existingIds.has(record.id)) {
            if (mergeStrategy === 'skip') {
              result.skipped++;
            } else {
              const updated = dogStore.dogs.map(d => d.id === record.id ? { ...d, ...record } : d);
              dogStore.setDogs(updated);
              result.imported++;
            }
          } else {
            dogStore.setDogs([...dogStore.dogs, record]);
            result.imported++;
          }
        }
      }
      break;
    }

    case 'entries': {
      const entryStore = useEntryStore.getState();
      const existingIds = new Set(entryStore.entries.map(e => e.id));
      const typedRecords = records as SyncableShowEntry[];

      if (mergeStrategy === 'replace') {
        entryStore.setEntries(typedRecords);
        result.imported = typedRecords.length;
      } else {
        for (const record of typedRecords) {
          if (existingIds.has(record.id)) {
            if (mergeStrategy === 'skip') {
              result.skipped++;
            } else {
              const updated = entryStore.entries.map(e => e.id === record.id ? { ...e, ...record } : e);
              entryStore.setEntries(updated);
              result.imported++;
            }
          } else {
            entryStore.setEntries([...entryStore.entries, record]);
            result.imported++;
          }
        }
      }
      break;
    }

    case 'people':
    case 'users': {
      const userStore = useUserStore.getState();
      const existingIds = new Set(userStore.people.map(p => p.id));
      const typedRecords = records as User[];

      if (mergeStrategy === 'replace') {
        userStore.setUsers(typedRecords);
        result.imported = typedRecords.length;
      } else {
        for (const record of typedRecords) {
          if (existingIds.has(record.id)) {
            if (mergeStrategy === 'skip') {
              result.skipped++;
            } else {
              const updated = userStore.people.map(p => p.id === record.id ? { ...p, ...record } : p);
              userStore.setUsers(updated);
              result.imported++;
            }
          } else {
            userStore.setUsers([...userStore.people, record]);
            result.imported++;
          }
        }
      }
      break;
    }

    case 'registrations': {
      const registrationStore = useRegistrationsStore.getState();
      const existingIds = new Set(registrationStore.registrations.map(r => r.id));
      const typedRecords = records as Registration[];

      if (mergeStrategy === 'replace') {
        registrationStore.setRegistrations(typedRecords);
        result.imported = typedRecords.length;
      } else {
        for (const record of typedRecords) {
          if (existingIds.has(record.id)) {
            if (mergeStrategy === 'skip') {
              result.skipped++;
            } else {
              registrationStore.updateRegistration(record);
              result.imported++;
            }
          } else {
            registrationStore.addRegistration(record);
            result.imported++;
          }
        }
      }
      break;
    }

    default:
      logger.warn('Unknown data type during import, skipping', 'lifecycle', { dataType });
      result.skipped = records.length;
      break;
  }

  return result;
}

/**
 * Perform the actual import by writing data into the appropriate stores.
 */
export async function performImport(
  data: ExportDataSet,
  options: ImportOptions
): Promise<Partial<ImportResult>> {
  let recordsImported = 0;
  let recordsSkipped = 0;
  let recordsFailed = 0;
  const errors: string[] = [];

  for (const [dataType, records] of Object.entries(data)) {
    logger.info('Importing records', 'lifecycle', { count: records.length, dataType });

    try {
      const result = importByType(dataType, records, options.mergeStrategy);
      recordsImported += result.imported;
      recordsSkipped += result.skipped;
      recordsFailed += result.failed;
      if (result.errors.length > 0) {
        errors.push(...result.errors);
      }
    } catch (error) {
      recordsFailed += records.length;
      errors.push(`Failed to import ${dataType}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    recordsImported,
    recordsSkipped,
    recordsFailed,
    errors,
  };
}
