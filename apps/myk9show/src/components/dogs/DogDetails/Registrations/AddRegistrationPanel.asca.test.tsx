import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { normalizeOrganization } from '@/features/dogs/identity';
import AddRegistrationPanel from './AddRegistrationPanel';

/**
 * MYK9-1162: an ASCA trial holds an entry until the dog has an ASCA number, and
 * the "Registration number needed" pane resolves it through this panel, so the
 * panel must offer ASCA, as a value the registry rule reads as ASCA.
 */
describe('AddRegistrationPanel ASCA', () => {
  it('offers ASCA, and its value normalizes to the ASCA registry', async () => {
    const { user } = render(
      <AddRegistrationPanel open={true} onClose={vi.fn()} onSave={vi.fn()} dogName="Maple" />
    );

    // The shared registration form (MYK9-1117) uses a Base UI select: its options render
    // once the menu opens, and an option's label is the value it saves.
    await user.click(await screen.findByRole('combobox', { name: /organization/i }));
    const option = await screen.findByRole('option', {
      name: 'ASCA (Australian Shepherd Club of America)',
    });
    expect(normalizeOrganization(option.textContent)).toBe('ASCA');
  });
});
