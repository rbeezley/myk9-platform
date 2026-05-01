// Authoritative data access module for the Class entity.
// All callers import from here — never from supabaseClient or replication
// tables directly, and never from the legacy queries/ files below.
//
// Implementations live in classQueries.ts during migration and will
// move into reads.ts / writes.ts in follow-up PRs.
//
// Entry functions that classQueries.ts re-exports are NOT included here —
// use @/services/database/entries for Entry data access.

export {
  getAllClasses,
  getClassById,
  getClassesByTrialId,
  createClass,
  updateClass,
  deleteClass,
  searchClasses,
  getClassStatistics,
  hardDeleteClass,
  restoreClass,
  getDeletedClasses,
} from '../queries/classQueries';
