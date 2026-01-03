// Enhanced Database Queries - Centralized Export
// Phase 2: Core Store Integration

// Export all query functions
export * from './dogQueries';
export * from './userQueries';
export * from './showQueries';
export * from './clubQueries';

// Export class queries with explicit naming to avoid conflicts
export {
  getAllClasses,
  getClassById,
  getClassesByTrialId,
  createClass,
  updateClass,
  deleteClass,
  searchClasses,
  getClassStatistics,
  // Also export additional class-specific functions
  getEntriesByClassId,
  // Rename conflicting entry functions from classQueries
  getAllEntries as getAllClassEntries,
  createEntry as createClassEntry,
  updateEntry as updateClassEntry,
  deleteEntry as deleteClassEntry
} from './classQueries';

// Export entry queries (these take precedence for entry operations)
export * from './entryQueries';