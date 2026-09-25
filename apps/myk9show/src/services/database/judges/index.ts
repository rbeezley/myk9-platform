// Authoritative data access module for the Judge entity.
// All callers import from here — never from supabaseClient or replication
// tables directly, and never from the legacy queries/ files below.
//
// Implementations live in reads.ts during migration and can split into
// reads.ts / writes.ts once the Judge module grows further.

export {
  getJudgesWithQualifications,
  // Judge qualifications
  replaceJudgeQualifications,
  createJudgeQualification,
  getJudgeQualificationById,
  getJudgeQualificationsByJudgeId,
  updateJudgeQualification,
  deleteJudgeQualification,
  deleteJudgeQualificationsByPersonId,
  suspendJudgeQualification,
  reinstateJudgeQualification,
  getJudgeQualificationSummary,
  // Judge analytics
  getJudgeRosterSummary,
  getJudgeUtilizationStats,
  getJudgeQualificationAlerts,
  getJudgeStats,
  getJudgeUpcomingAssignments,
  getJudgeAssignmentTrends,
  // Judge availability
  upsertJudgeAvailability,
  getJudgeAvailabilityByPersonId,
  // Judge certifications
  createJudgeCertification,
  // Judge assignments
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
export { showJudgesChanged } from './showJudgesChanged';
export {
  getActiveJudgeAssignmentShows,
  getActiveJudgeAssignmentsForShow,
  subscribeToJudgeAssignmentChanges,
} from './assignmentReads';
export type { JudgedShow } from './assignmentReads';
export {
  ACTIVE_JUDGE_ASSIGNMENT_STATUSES,
  isActiveJudgeAssignmentStatus,
} from './assignmentStatus';
export type { ActiveJudgeAssignmentStatus } from './assignmentStatus';
