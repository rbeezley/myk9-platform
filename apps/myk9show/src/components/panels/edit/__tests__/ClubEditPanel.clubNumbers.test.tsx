/**
 * MYK9-1235: the Edit Club panel shows one club-number field per registry
 * (AKC, UKC, ASCA) instead of a single free-text "Club Number".
 */

import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import type { Club } from '@/types/club-types';
import { ClubEditPanel } from '../ClubEditPanel';

vi.mock('@/components/shows/WithdrawalPolicyCard', () => ({
  WithdrawalPolicyCard: () => null,
}));

const baseClub: Partial<Club> = {
  id: 'club-1',
  name: 'Heartland Scent Work Club',
  email: 'club@example.com',
  phone: '555-123-4567',
  address: { street: '1 Main St', city: 'Omaha', state: 'NE', zipCode: '68102', country: 'US' },
};

function panelElement(
  initialClubData: Partial<Club>,
  onSave: React.ComponentProps<typeof ClubEditPanel>['onSave']
) {
  return (
    <ClubEditPanel
      open
      onClose={() => {}}
      clubId="club-1"
      clubName="Heartland Scent Work Club"
      initialClubData={initialClubData}
      mode="edit"
      onSave={onSave}
    />
  );
}

function renderPanel(
  initialClubData: Partial<Club>,
  onSave = vi.fn().mockResolvedValue(undefined)
) {
  render(
    <ClubEditPanel
      open
      onClose={() => {}}
      clubId="club-1"
      clubName="Heartland Scent Work Club"
      initialClubData={initialClubData}
      mode="edit"
      onSave={onSave}
    />
  );
  return onSave;
}

describe('ClubEditPanel club numbers', () => {
  it('shows one field per organization, prefilled, and no single "Club Number" field', async () => {
    renderPanel({ ...baseClub, registryNumbers: { AKC: '4521' } });

    expect(await screen.findByLabelText('AKC club number')).toHaveValue('4521');
    expect(screen.getByLabelText('UKC club number')).toHaveValue('');
    expect(screen.getByLabelText('ASCA club number')).toHaveValue('');
    expect(screen.queryByLabelText('Club Number')).not.toBeInTheDocument();
  });

  it('saves two numbers for one club, with the blank organization left out', async () => {
    const user = userEvent.setup();
    const onSave = renderPanel({ ...baseClub, registryNumbers: { AKC: '4521' } });

    await user.type(await screen.findByLabelText('UKC club number'), ' U-9 ');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0].registryNumbers).toEqual({ AKC: '4521', UKC: 'U-9' });
  });

  it('turns a cleared field into an absent organization', async () => {
    const user = userEvent.setup();
    const onSave = renderPanel({ ...baseClub, registryNumbers: { AKC: '4521', UKC: 'U-9' } });

    await user.clear(await screen.findByLabelText('UKC club number'));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0].registryNumbers).toEqual({ AKC: '4521' });
  });

  it('refuses to save a club that had a number down to none', async () => {
    const user = userEvent.setup();
    const onSave = renderPanel({ ...baseClub, registryNumbers: { AKC: '4521' } });

    await user.clear(await screen.findByLabelText('AKC club number'));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByText('Enter at least one club number.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps the fields disabled and sends no numbers until the club's numbers have loaded", async () => {
    const user = userEvent.setup();
    const onSave = renderPanel(baseClub);

    expect(await screen.findByLabelText('AKC club number')).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: /Club Name/ }), ' East');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty('registryNumbers');
  });

  it('hydrates numbers that load after another field was edited, so saving UKC keeps AKC', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(panelElement(baseClub, onSave));

    await user.type(await screen.findByRole('textbox', { name: /Club Name/ }), ' East');
    expect(screen.getByLabelText('AKC club number')).toBeDisabled();

    rerender(panelElement({ ...baseClub, registryNumbers: { AKC: '4521' } }, onSave));
    await waitFor(() => expect(screen.getByLabelText('AKC club number')).toHaveValue('4521'));
    expect(screen.getByLabelText('AKC club number')).toBeEnabled();

    await user.type(screen.getByLabelText('UKC club number'), 'U-9');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0].registryNumbers).toEqual({ AKC: '4521', UKC: 'U-9' });
  });
});
