// Deprecated Adapter: Entry operations now live behind the Entry Module Seam.
// New callers should import from '@/services/database/entries'.
import type { DbEntryUpdate } from '@/types/database-mappings';
import { updateEntry as updateEntryWithParams } from '../entries';

export {
  getAllEntries,
  getEntriesByClassId,
  createEntry,
  hardDeleteEntry,
  restoreEntry,
  getDeletedEntries,
} from '../entries';

export {
  deleteEntry,
} from '../entries';

export { updateEntryWithParams };

export const updateEntry = async (id: string, updates: DbEntryUpdate) => {
  return updateEntryWithParams({ id, updates });
};
