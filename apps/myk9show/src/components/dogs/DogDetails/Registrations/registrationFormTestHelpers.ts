import { screen } from '@testing-library/react';
import type { render } from '@/test/utils/testUtils';

type User = ReturnType<typeof render>['user'];

/**
 * Fills the shared registration form (MYK9-1117) with a new AKC Beagle: a Base UI
 * organization select and a searchable breed combobox, not native selects.
 */
export async function fillNewRegistration(user: User) {
  await user.click(await screen.findByRole('combobox', { name: /registration organization/i }));
  await user.click(await screen.findByRole('option', { name: /AKC \(American Kennel Club\)/ }));
  await user.type(screen.getByLabelText(/registered name/i), 'CH New Dog');
  await user.click(screen.getByRole('combobox', { name: /registered breed/i }));
  await user.click(await screen.findByRole('option', { name: 'Beagle' }));
  await user.type(screen.getByLabelText(/registration number/i), 'SR999');
}
