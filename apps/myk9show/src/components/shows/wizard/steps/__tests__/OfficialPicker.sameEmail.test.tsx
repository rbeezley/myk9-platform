import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils/testUtils';
import { OfficialPicker } from '../OfficialPicker';
import { OfficialAlreadyHoldsRoleError } from '../useCreateOfficialPerson';

describe('OfficialPicker Add new with the other official email', () => {
  it('passes the people who cannot take the role and says who holds it', async () => {
    const onCreatePerson = vi.fn(async () => {
      throw new OfficialAlreadyHoldsRoleError('Priya Raman');
    });
    const onSelect = vi.fn();
    renderWithProviders(
      <OfficialPicker
        label="Secretary"
        people={[]}
        selectedPersonId={undefined}
        suggestedRoles={[]}
        excludePersonIds={['chair-1']}
        excludedRoleLabel="Chair"
        onSelect={onSelect}
        onCreatePerson={onCreatePerson}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /secretary/i }));
    await userEvent.click(await screen.findByText('Add new Secretary'));
    await userEvent.type(screen.getByLabelText(/first name/i), 'Priya');
    await userEvent.type(screen.getByLabelText(/last name/i), 'Raman');
    await userEvent.type(screen.getByLabelText(/email/i), 'p@example.com');
    await userEvent.type(screen.getByLabelText(/phone/i), '5550102020');
    await userEvent.click(screen.getByRole('button', { name: 'Add Secretary' }));

    expect(onCreatePerson).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'p@example.com' }),
      { excludePersonIds: ['chair-1'] }
    );
    expect(
      await screen.findByText(
        'Priya Raman is already the Chair. Pick a different person for Secretary.'
      )
    ).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
