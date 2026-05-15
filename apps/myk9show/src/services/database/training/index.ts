// Authoritative data access module for Dog Training Records, spanning three
// sub-tables: journal entries (per-session notes), goals (open-ended objectives),
// and milestones (dated achievements).
// All callers import from here — never from supabaseClient directly.

export type { DbTrainingJournalEntryInsert, DbTrainingJournalEntryUpdate } from './entries';
export type { DbTrainingGoalInsert, DbTrainingGoalUpdate } from './goals';
export type { DbTrainingMilestoneInsert, DbTrainingMilestoneUpdate } from './milestones';

export {
  getAllTrainingEntries,
  getTrainingEntryById,
  createTrainingEntry,
  updateTrainingEntry,
  deleteTrainingEntry,
} from './entries';

export { getAllTrainingGoals, createTrainingGoal, updateTrainingGoal } from './goals';

export {
  getAllTrainingMilestones,
  createTrainingMilestone,
  updateTrainingMilestone,
  deleteTrainingMilestone,
} from './milestones';
