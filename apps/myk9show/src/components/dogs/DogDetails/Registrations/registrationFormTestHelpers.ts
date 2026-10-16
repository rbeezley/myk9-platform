import { expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type { render } from '@/test/utils/testUtils';

type User = ReturnType<typeof render>['user'];

/** Save-contract tests enter a complete value; keyboard behavior is covered separately. */
export async function enterRegistrationText(user: User, input: HTMLElement, value: string) {
  await user.click(input);
  await user.clear(input);
  await user.paste(value);
}

/**
 * Fills the shared registration form (MYK9-1117) with a new AKC Beagle: a Base UI
 * organization select and a searchable breed combobox, not native selects.
 */
export async function fillNewRegistration(user: User) {
  const organization = await screen.findByRole('combobox', { name: /registration organization/i });
  await user.click(organization);
  await user.click(await screen.findByRole('option', { name: /AKC \(American Kennel Club\)/ }));
  await waitFor(() => expect(organization).toHaveFocus());
  await enterRegistrationText(user, screen.getByLabelText(/registered name/i), 'CH New Dog');
  const breed = screen.getByRole('combobox', { name: /registered breed/i });
  await user.click(breed);
  await user.click(await screen.findByRole('option', { name: 'Beagle' }));
  await waitFor(() => expect(breed).toHaveAttribute('aria-expanded', 'false'));
  await enterRegistrationText(user, screen.getByLabelText(/registration number/i), 'SR999');
}
