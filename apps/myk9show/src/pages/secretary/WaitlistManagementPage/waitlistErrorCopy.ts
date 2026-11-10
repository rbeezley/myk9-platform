/**
 * MYK9-1844: what the Waitlist tab says when it cannot load or an action fails.
 * These show in the tab's alert, whose "Try again" button reloads the list. An
 * offer or removal may have gone through before a later step failed, so those
 * sentences send the secretary to the reloaded list before acting again.
 */
export const WAITLIST_COPY = {
  loadClassesFailed: "We couldn't load this show's classes. Try again.",
  loadWaitlistFailed: "We couldn't load the waitlist. Try again.",
  offerFailed:
    "We couldn't finish offering this spot. Press Try again to reload the list, and check the Offered list before you offer it again.",
  removeFailed:
    "We couldn't remove this dog from the waitlist. Press Try again to reload the list, and remove the dog again if it is still there.",
  /** The list has already been reloaded when this shows. */
  withdrawFailed:
    "We couldn't withdraw this offer. If it is still in the Offered list, withdraw it again.",
} as const;
