/**
 * Codes and copy for the sign-in email guard (MYK9-136).
 *
 * Kept here, with no imports, because both the guard in the data layer and
 * `errorMessages` need them: in production `getUserFriendlyError` maps by CODE
 * and discards the message, so the refusal has to be a code the map knows or
 * the operator only ever sees "Failed to update user".
 */

export const SIGN_IN_EMAIL_LOCKED_CODE = 'SIGN_IN_EMAIL_LOCKED';
export const SIGN_IN_EMAIL_UNVERIFIABLE_CODE = 'SIGN_IN_EMAIL_UNVERIFIABLE';

export const SIGN_IN_EMAIL_LOCKED_MESSAGE =
  'This person signs in with this email address, so it cannot be changed here. ' +
  'Changing it would leave them signing in with the old address while every ' +
  'screen showed the new one. Send them a sign-in link instead.';

export const SIGN_IN_EMAIL_UNVERIFIABLE_MESSAGE =
  'Could not verify this account before changing its email address. Please try again.';

/**
 * MYK9-1071 (owner decision, review round 2): edits to an EXISTING person save
 * online only. Offline, the save is refused with this code rather than queued
 * or silently paused, so the user keeps their form. Creating a person offline
 * (the show-desk add-entry flow) is unaffected.
 */
export const PERSON_EDIT_NEEDS_CONNECTION_CODE = 'PERSON_EDIT_NEEDS_CONNECTION';
export const PERSON_EDIT_NEEDS_CONNECTION_MESSAGE =
  'Reconnect to save changes. Edits to a person save only while online.';
