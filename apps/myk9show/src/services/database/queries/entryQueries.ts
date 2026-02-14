/**
 * Entry-related database queries
 *
 * Barrel file re-exporting all entry query operations.
 * Lookup/search operations are in entry-query-lookups.ts.
 * Mutation operations are in entry-query-mutations.ts.
 *
 * Note: Each row in the entries table represents one dog's entry into one class.
 */

// Lookup and search operations
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
} from './entry-query-lookups';

// Mutation operations
export {
  createEntry,
  updateEntry,
  deleteEntry,
  updateEntryStatus,
  createMultipleEntries,
  updateEntryDetails,
  updateEntryHandler,
  withdrawEntry,
} from './entry-query-mutations';
