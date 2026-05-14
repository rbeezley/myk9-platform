// Authoritative data access module for the Achievement entity.
// All callers import from here — never from supabaseClient directly.

export {
  createAchievement,
  getAchievementById,
  getAchievementsByDogId,
  updateAchievement,
  deleteAchievement,
  getAchievementSummary,
} from './reads';
