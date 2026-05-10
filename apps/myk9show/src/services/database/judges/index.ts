// Authoritative data access module for the Judge entity.
// All callers import from here — never from supabaseClient or replication
// tables directly, and never from the legacy queries/ files below.
//
// Implementations live in reads.ts during migration and can split into
// reads.ts / writes.ts once the Judge module grows further.

export {
  getJudgesWithQualifications,
  judgeQualificationQueries,
  judgeAnalyticsQueries,
  judgeAvailabilityQueries,
  judgeCertificationQueries,
  reassignClassJudge,
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
