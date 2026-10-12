/**
 * UI drivers for the real-component Quick Create tests (MYK9-1081). They fill
 * the real Person, Dog and registration forms the way a secretary does.
 */
import { expect } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

type User = ReturnType<typeof userEvent.setup>;

/** Every open modal surface. Never count while a Select or popover is open. */
export const dialogs = () => document.querySelectorAll('[role="dialog"]');
export const panel = () => document.querySelector('.slide-over-panel');

/** Add Person, both tabs, with only the required names. */
export async function addPersonThroughForm(user: User) {
  await user.type(await screen.findByLabelText(/First Name/i), 'Molly');
  await user.type(screen.getByLabelText(/Last Name/i), 'Mailbox');
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
  await user.type(await screen.findByLabelText(/Call Name/i), callName);
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
  await user.type(screen.getByLabelText(/Registered Name/i), 'Mailbox Special Delivery');
  fireEvent.change(screen.getByPlaceholderText(/search breeds/i), {
    target: { value: 'golden' },
  });
  fireEvent.click(screen.getByRole('option', { name: 'Golden Retriever' }));
  await user.type(document.getElementById('registrationNumber') as HTMLElement, number);
  await user.click(screen.getByRole('button', { name: 'Save Registration' }));
}
