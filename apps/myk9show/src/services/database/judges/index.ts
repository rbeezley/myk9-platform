// Authoritative data access module for the Judge entity.
// All callers import from here — never from supabaseClient or replication
// tables directly, and never from the legacy queries/ files below.
//
// Implementations live in judgeQueries.ts during migration and will
// move into reads.ts / writes.ts in follow-up PRs.

export {
  judgeQualificationQueries,
  judgeAnalyticsQueries,
  judgeAvailabilityQueries,
  judgeCertificationQueries,
  upsertClassJudgeAssignment,
  persistShowJudgeAssignments,
} from './reads';
export type {
  JudgeUtilizationFilters,
  JudgeUtilizationRow,
  JudgeAssignmentRow,
  RosterSummary,
  CreateJudgeCertificationDbData,
  JudgeAvailabilityUpsertData,
} from './reads';
