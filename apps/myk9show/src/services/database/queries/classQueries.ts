// Compatibility adapter for legacy imports.
// New code should import Class operations from '@/services/database/classes'
// and Entry operations from '@/services/database/entries'.
export * from '../classes';

// Re-export entry operations from sibling module for backward compatibility
// with callers that historically imported them from classQueries.
export {
  getAllEntries,
  getEntriesByClassId,
  createEntry,
  updateEntry,
  deleteEntry,
  hardDeleteEntry,
  restoreEntry,
  getDeletedEntries,
} from './classQueries.entries';
