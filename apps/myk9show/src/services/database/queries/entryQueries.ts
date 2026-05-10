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
  updateEntryStatus,
  updateEntryStatusWithAudit,
} from '@/services/database/entries';
