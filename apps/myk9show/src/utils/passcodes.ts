import { generatePasscodesFromShowId, type ShowPasscodes } from '@myk9/core';

export { generatePasscodesFromShowId, type ShowPasscodes };

/**
 * Returns the pre-filled show-access URL for the exhibitor passcode.
 * Returns '' if showId is not a valid UUID.
 */
export function getExhibitorLoginUrl(showId: string): string {
  const passcodes = generatePasscodesFromShowId(showId);
  if (!passcodes) return '';
  return `https://myk9show.com/at-show?code=${passcodes.exhibitor}`;
}
