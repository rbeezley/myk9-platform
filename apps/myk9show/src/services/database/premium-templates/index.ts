// Authoritative data access module for club Premium Templates and the
// per-show Premium Generations they produce.
// All callers import from here — never from supabaseClient directly.

export {
  getClubPremiumTemplates,
  createClubPremiumTemplate,
  updateClubPremiumTemplate,
  deleteClubPremiumTemplate,
} from './templates';

export { getRecentPremiumGenerations, insertPremiumGeneration } from './generations';
