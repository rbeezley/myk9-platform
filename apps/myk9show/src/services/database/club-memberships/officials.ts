// Names of a club's admins and secretaries, for the line under the club name.
//
// Reads through the get_club_officials SECURITY DEFINER RPC (MYK9-860). A direct
// user_roles read cannot serve this: SA-006 scopes it to the caller's own row, so a
// club admin never saw their co-admins. The RPC returns the full list to site
// admins, this club's admins and secretaries, and its active members, and ZERO ROWS
// (not an error) to anyone else, so an error from here is always a real failure.

import { supabase } from '../supabaseClient';

export interface ClubOfficials {
  adminNames: string[];
  secretaryNames: string[];
}

export async function getClubOfficials(clubId: string): Promise<ClubOfficials> {
  const { data, error } = await supabase.rpc('get_club_officials', { p_club_id: clubId });

  if (error) throw error;

  const officials: ClubOfficials = { adminNames: [], secretaryNames: [] };
  for (const row of data ?? []) {
    if (!row.person_name) continue;
    (row.role === 'club_admin' ? officials.adminNames : officials.secretaryNames).push(
      row.person_name
    );
  }
  return officials;
}
