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
 *   Admin    → 'a' + segment[1]           (4 hex chars)
 *   Judge    → 'j' + segment[2]           (4 hex chars)
 *   Steward  → 's' + segment[3]           (4 hex chars)
 *   Exhibitor→ 'e' + segment[4].slice(0,4)(first 4 of 12 hex chars)
 */
export function generatePasscodesFromShowId(showId: string): ShowPasscodes | null {
  const parts = showId.split('-');
  if (parts.length !== 5) return null;
  return {
    admin: `a${parts[1]}`,
    judge: `j${parts[2]}`,
    steward: `s${parts[3]}`,
    exhibitor: `e${parts[4].slice(0, 4)}`,
  };
}

/**
 * Returns the pre-filled myK9Q login URL for the exhibitor passcode.
 * Returns '' if showId is not a valid UUID.
 */
export function getExhibitorLoginUrl(showId: string): string {
  const passcodes = generatePasscodesFromShowId(showId);
  if (!passcodes) return '';
  return `https://app.myk9q.com/login?code=${passcodes.exhibitor}`;
}
