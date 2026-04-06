export interface ShowPasscodes {
  admin: string;
  judge: string;
  steward: string;
  exhibitor: string;
}

/**
 * Derives four role passcodes from a show UUID.
 *
 * UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (5 segments)
 *   Admin     → 'a' + segment[1]            (4 hex chars)
 *   Judge     → 'j' + segment[2]            (4 hex chars)
 *   Steward   → 's' + segment[3]            (4 hex chars)
 *   Exhibitor → 'e' + segment[4].slice(0,4) (first 4 of 12 hex chars)
 */
export function generatePasscodesFromShowId(showId: string): ShowPasscodes | null {
  const [, seg1, seg2, seg3, seg4] = showId.split('-');
  if (!seg1 || !seg2 || !seg3 || !seg4) return null;
  return {
    admin: `a${seg1}`,
    judge: `j${seg2}`,
    steward: `s${seg3}`,
    exhibitor: `e${seg4.slice(0, 4)}`,
  };
}
