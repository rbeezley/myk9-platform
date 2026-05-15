// Authoritative data access module for the people affiliated with a Club:
// regular members (club_members), elected officers (club_officers), and
// RBAC-scoped show managers (user_roles filtered to secretary + club_id).
// All callers import from here — never from supabaseClient directly.

export { getClubMembers, addClubMember, updateClubMember, removeClubMember } from './members';

export { getClubOfficers, addClubOfficer, removeClubOfficer } from './officers';

export { getClubShowManagerIds } from './show-managers';
