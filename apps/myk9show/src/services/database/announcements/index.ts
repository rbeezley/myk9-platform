// Authoritative data access module for the Announcement entity.
// All callers import from here — never from supabaseClient directly.

export { getAnnouncementsByShow } from './reads';

export {
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  markAnnouncementRead,
  markAllAnnouncementsRead,
} from './writes';
