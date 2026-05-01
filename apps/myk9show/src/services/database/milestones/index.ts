// Authoritative data access module for the Milestone entity.
// All callers import from here — never from supabaseClient directly.

export type { UserMilestone } from '../queries/milestoneQueries';
export {
  getUserMilestones,
  achieveMilestone,
  dismissMilestoneTip,
} from '../queries/milestoneQueries';
