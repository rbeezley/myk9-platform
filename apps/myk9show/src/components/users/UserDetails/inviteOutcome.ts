/**
 * What `admin-invite-user` reports when it answers 200 but did NOT send anything
 * (the person is gone, or an `onlyIfNeverSignedIn` guard declined). Every caller
 * of the function maps its response through here, so none of them can announce
 * "Invitation sent" for a result that sent nothing.
 */

import type { InviteResponse } from './useSendUserInvitation';

/** The honest "nothing was sent" message for this response, or null when an email went out. */
export function inviteNotSentMessage(data: InviteResponse | null | undefined): string | null {
  switch (data?.outcome) {
    case 'not_found':
      return 'This person no longer exists — no invitation was sent.';
    case 'skipped':
      return 'This person has already signed in — no invitation was sent.';
    default:
      return null;
  }
}
