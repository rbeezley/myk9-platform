/**
 * UI drivers for the real-component Quick Create tests (MYK9-1081). They fill
 * the real Person, Dog and registration forms the way a secretary does.
 */
import { expect } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

type User = ReturnType<typeof userEvent.setup>;

/**
 * Per-test timeout for the real-component Quick Create journeys. Each one
 * drives the real Person, Dog and registration forms (Selects, tabs, saves);
 * under CI coverage with sibling shards they measured 8-14s, past vitest's
 * 10s default (main run 38201815540). Same remedy as the 20s journeys in
 * HandlerSelectionDialog.nameEntry and popover.spaceKey, with CI headroom.
 */
export const JOURNEY_TIMEOUT_MS = 30_000;

/** Every open modal surface. Never count while a Select or popover is open. */
export const dialogs = () => document.querySelectorAll('[role="dialog"]');
export const panel = () => document.querySelector('.slide-over-panel');

/**
 * Enters a whole value as one input event. `user.type` costs one event per
 * character, and under CI coverage these forms re-render at ~100-200ms a
 * keystroke: the one-panel journey typed 46 characters and crossed vitest's
 * 10s timeout on main (LESSON vitest-timeout-names-it). The assertions check
 * the value that lands, not keystroke handling.
 */
async function enter(user: User, field: HTMLElement, value: string) {
  await user.click(field);
  await user.paste(value);
}

/** Add Person, both tabs, with only the required names. */
export async function addPersonThroughForm(user: User) {
  await enter(user, await screen.findByLabelText(/First Name/i), 'Molly');
  await enter(user, screen.getByLabelText(/Last Name/i), 'Mailbox');
  await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
  await user.click(await screen.findByRole('button', { name: 'Add Person' }));
}

/** Picks one option from a Base UI Select and waits for its popup to close. */
export async function chooseOption(user: User, trigger: HTMLElement, option: RegExp | string) {
  await user.click(trigger);
  await user.click(await screen.findByRole('option', { name: option }));
  // Not "no listbox": the breed picker's own list is one, and it stays open.
  await waitFor(() => expect(screen.queryByRole('option', { name: option })).toBeNull());
}

/** The Essential tab's required fields: call name, sex and date of birth. */
export async function fillDogBasics(user: User, callName = 'Ziggy') {
  await enter(user, await screen.findByLabelText(/Call Name/i), callName);
  await chooseOption(user, document.getElementById('gender') as HTMLElement, /^Male/);
  fireEvent.change(document.getElementById('dateOfBirth') as HTMLElement, {
    target: { value: '2020-01-01' },
  });
}

/** Fills the open registration form and saves it. */
export async function fillRegistration(user: User, number = 'DN12345601') {
  await chooseOption(
    user,
    document.getElementById('organization') as HTMLElement,
    'AKC (American Kennel Club)'
  );
  await enter(user, screen.getByLabelText(/Registered Name/i), 'Mailbox Special Delivery');
  fireEvent.change(screen.getByPlaceholderText(/search breeds/i), {
    target: { value: 'golden' },
  });
  fireEvent.click(screen.getByRole('option', { name: 'Golden Retriever' }));
  await enter(user, document.getElementById('registrationNumber') as HTMLElement, number);
  await user.click(screen.getByRole('button', { name: 'Save Registration' }));
}
