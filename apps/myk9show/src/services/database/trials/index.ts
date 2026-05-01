// Authoritative data access module for the Trial entity.
// All callers import from here — never from supabaseClient or replication
// tables directly, and never from the legacy queries/ files below.
//
// Implementations live in trialQueries.ts during migration and will
// move into reads.ts / writes.ts in follow-up PRs.

export {
  getAllTrials,
  getTrialById,
  getTrialsByShow,
  searchTrials,
  getTrialsByStatus,
  getUpcomingTrials,
  getTrialsByDateRange,
  getTrialStatistics,
  createTrial,
  updateTrial,
  deleteTrial,
  hardDeleteTrial,
  restoreTrial,
  getDeletedTrials,
} from '../queries/trialQueries';
