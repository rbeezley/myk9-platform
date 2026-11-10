import { describe, expect, it } from 'vitest';
import {
  ENTRY_SUBMIT_FAILED,
  PlainEntryError,
  entrySubmitErrorMessage,
} from './entrySubmitErrorCopy';
import { OWNER_ADDRESS_REQUIRED_CODE } from './ownerAddress';
import { createDatabaseError } from '@/services/database/databaseError';

describe('entrySubmitErrorMessage (MYK9-1823)', () => {
  it.each([
    ['a developer string', new Error('Invariant: submitShowRegistration called with credit_card')],
    ['a database error', createDatabaseError({ message: 'permission denied', code: '42501' })],
    ['a network failure', new TypeError('Failed to fetch')],
    ['a thrown string', 'boom'],
    ['nothing at all', undefined],
  ])('falls back to the fixed sentence for %s', (_label, error) => {
    expect(entrySubmitErrorMessage(error, 'exhibitorSubmit')).toBe(
      ENTRY_SUBMIT_FAILED.exhibitorSubmit
    );
  });

  it('picks the sentence for the path that failed', () => {
    const error = new Error('Failed to add entry');
    expect(entrySubmitErrorMessage(error, 'cardCheckout')).toBe(ENTRY_SUBMIT_FAILED.cardCheckout);
    expect(entrySubmitErrorMessage(error, 'organizerSubmit')).toBe(
      ENTRY_SUBMIT_FAILED.organizerSubmit
    );
  });

  it('shows a sentence the flow worded on purpose as it is', () => {
    const message =
      'Entries are closed for this show. Contact the trial secretary for late-entry help.';
    expect(entrySubmitErrorMessage(new PlainEntryError(message), 'exhibitorSubmit')).toBe(message);
  });

  it('shows the owner-address refusal the server wrote for the exhibitor', () => {
    const message =
      "Add the owner's city to enter Rover in an AKC trial. AKC prints the owner's address in the marked catalog.";
    const error = createDatabaseError({ message, code: OWNER_ADDRESS_REQUIRED_CODE });
    expect(entrySubmitErrorMessage(error, 'exhibitorSubmit')).toBe(message);
  });

  it('shows the class-closed refusals the server wrote, and no other 42501 text', () => {
    const closed = 'This class was cancelled, so it can no longer be entered: Novice Container';
    expect(
      entrySubmitErrorMessage(
        createDatabaseError({ message: closed, code: '42501' }),
        'exhibitorSubmit'
      )
    ).toBe(closed);
    expect(
      entrySubmitErrorMessage(
        createDatabaseError({ message: 'caller does not own dog 123', code: '42501' }),
        'exhibitorSubmit'
      )
    ).toBe(ENTRY_SUBMIT_FAILED.exhibitorSubmit);
  });

  it('writes no em dashes and no software words into the fixed sentences', () => {
    for (const sentence of Object.values(ENTRY_SUBMIT_FAILED)) {
      expect(sentence).not.toMatch(/—|server|\brequest\b|invalid|session|registration/i);
    }
  });
});
