// Redirect barrel — implementations moved to @/services/database/entries.
// Callers should migrate to import from '@/services/database/entries' directly.
export {
  getAllEntries,
  getEntryById,
  getEntriesByShow,
  getEntriesByClass,
  getEntriesByDog,
  getEntriesByStatus,
  getEntryStatistics,
  getUserEntries,
  searchEntries,
  canModifyEntry,
  createEntry,
  updateEntry,
  deleteEntry,
  createMultipleEntries,
  updateEntryDetails,
  updateEntryHandler,
  withdrawEntry,
} from '@/services/database/entries';

// updateEntryStatus excluded from the main barrel (name conflict with secretary version);
// re-exported here from writes.ts directly for backward compatibility.
export { updateEntryStatus } from '@/services/database/entries/writes';
