/**
 * UI drivers for the real-component Quick Create tests (MYK9-1081). They fill
 * the real Person, Dog and registration forms the way a secretary does.
 */
import { expect } from 'vitest';
import { fireEvent, isInaccessible, screen, waitFor } from '@testing-library/react';
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
  const choice = await screen.findByRole('option', { name: option });
  await user.click(choice);
  // Closed = the chosen option is hidden (Base UI keeps the popup mounted via
  // forceMount; if that ever changes this times out loudly). Watch that
  // one node: once AKC is chosen the breed picker mounts ~300 options, and
  // re-running a screen-wide ByRole query over them took 2-3s per close under
  // coverage. Not "no listbox" either: the breed list is one, and stays open.
  await waitFor(() => expect(isInaccessible(choice)).toBe(true));
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

/**
 * Add Dog's first step (MYK9-1162): registry and number, "Find dog", then the rest of the
 * registration, saved as the dog's first. The panel moves on to Essential afterwards.
 */
export async function addFirstRegistration(user: User, number = 'DN12345601') {
  await chooseOption(
    user,
    document.getElementById('organization') as HTMLElement,
    'AKC (American Kennel Club)'
  );
  await enter(user, document.getElementById('registrationNumber') as HTMLElement, number);
  await user.click(screen.getByRole('button', { name: 'Find dog' }));
  await enter(user, await screen.findByLabelText(/Registered Name/i), 'Mailbox Special Delivery');
  fireEvent.change(screen.getByPlaceholderText(/search breeds/i), {
    target: { value: 'golden' },
  });
  fireEvent.click(screen.getByRole('option', { name: 'Golden Retriever' }));
  await user.click(screen.getByRole('button', { name: 'Save and continue' }));
}
