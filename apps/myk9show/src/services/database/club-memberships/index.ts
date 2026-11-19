// Authoritative data access module for the people affiliated with a Club:
// regular members (club_members), elected officers (club_officers), and
// RBAC-scoped show managers (user_roles filtered to secretary + club_id).
// All callers import from here — never from supabaseClient directly.

export {
  getClubMembers,
  getActiveClubMembers,
  countActiveClubMembers,
  addClubMember,
  updateClubMember,
  removeClubMember,
} from './members';

export {
  getClubOfficers,
  addClubOfficer,
  removeClubOfficer,
  fetchShowClubOfficers,
} from './officers';

export { getClubAdmins, addClubAdminByEmail, removeClubAdmin } from './club-admins';
export type { ClubAdmin, AddClubAdminOutcome } from './club-admins';

export {
  getClubAdminInvites,
  inviteClubAdmin,
  sendClubAdminInviteEmail,
  cancelClubAdminInvite,
} from './club-admin-invites';
export type {
  ClubAdminInvite,
  InviteClubAdminOutcome,
  InviteClubAdminResult,
} from './club-admin-invites';

export { getClubShowManagers, setClubShowManagerAccess } from './show-managers';
export type { ClubShowManager } from './show-managers';

export { getClubOfficials } from './officials';
export type { ClubOfficials } from './officials';
