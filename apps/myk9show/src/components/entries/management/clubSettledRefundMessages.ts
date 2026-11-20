// MYK9-2303: the server's refusal codes, in language a secretary can act on.
export const CLUB_REFUND_ERROR_MESSAGES: Record<string, string> = {
  not_authorized: 'Only this show’s secretary or club admin can record a club refund.',
  entry_not_found: 'We could not find this entry. Close this window and try again.',
  not_card_paid: 'This entry was not paid by card, so there is nothing to record here.',
  payout_not_completed:
    'The club has not been paid for this show yet. Issue the refund to the exhibitor’s card instead.',
  amount_exceeds_balance: 'That is more than is left to refund on this entry. Lower the amount.',
  invalid_amount: 'Enter an amount greater than zero.',
  invalid_method: 'Choose how the club paid it back: check, cash or other.',
  already_reversed: 'This record was already marked as a mistake.',
  not_reversible: 'This record cannot be reversed.',
  retry_key_conflict:
    'That save conflicts with an earlier one. Close this window, reopen it and try again.',
};

/** Any other failure, including a lost connection: the write may or may not have landed. */
export const CLUB_REFUND_UNCONFIRMED =
  'We could not confirm the record. It may already have been saved. Check the list below, then try again if it is not there.';

export const CLUB_REFUND_INTRO =
  'The club has already been paid for this show, so no card refund is issued. Record only money the club already paid the exhibitor.';

export const CLUB_REFUND_OFFLINE = 'Needs a connection';
