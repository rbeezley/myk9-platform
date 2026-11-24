/**
 * MYK9-2365: the club's AKC / UKC / ASCA numbers are edited inside the Edit Club panel.
 * They are online-only data, saved apart from the offline-first club row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  online: { value: true },
  error: vi.fn(),
}));

vi.mock('@/services/database/clubs', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/clubs')>()),
  getClubRegistryNumbers: mocks.get,
  saveClubRegistryNumbers: mocks.save,
}));
vi.mock('@/hooks/useNetworkStatus', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useNetworkStatus')>()),
  useIsOnline: () => mocks.online.value,
}));
vi.mock('@/lib/notifications', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/notifications')>();
  return {
    ...actual,
    notifications: { ...actual.notifications, error: mocks.error },
  };
});
vi.mock('@/components/shows/WithdrawalPolicyCard', () => ({ WithdrawalPolicyCard: () => null }));

import { ClubEditPanel } from '../ClubEditPanel';

const CLUB = {
  id: 'club-1',
  name: 'Heartland',
  description: '',
  email: 'club@example.com',
  phone: '555-123-4567',
  address: { street: '1 Main St', city: 'Austin', state: 'TX', zipCode: '75001', country: 'US' },
  clubType: 'local' as const,
};

function renderPanel(
  mode: 'create' | 'edit' = 'edit',
  initialClubData: Record<string, unknown> = CLUB
) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <ClubEditPanel
      open
      onClose={onClose}
      clubId="club-1"
      clubName="Heartland"
      initialClubData={initialClubData}
      onSave={onSave}
      mode={mode}
    />
  );
  return { onSave, onClose };
}

const akc = () => screen.findByRole('textbox', { name: /AKC club number/ });
const loadedAkc = () => screen.findByDisplayValue('4521');
const saveButton = () => screen.getByRole('button', { name: 'Save Changes' });

describe('ClubEditPanel club numbers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.online.value = true;
    mocks.get.mockResolvedValue({ AKC: '4521' });
    mocks.save.mockResolvedValue(undefined);
  });

  it('shows one field per registry, filled from the stored numbers', async () => {
    renderPanel();
    expect(await loadedAkc()).toBeEnabled();
    expect(screen.getByRole('textbox', { name: /UKC club number/ })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: /ASCA club number/ })).toHaveValue('');
  });

  it('saves only the typed number, and skips the club row when it did not change', async () => {
    const user = userEvent.setup();
    const { onSave } = renderPanel();
    await loadedAkc();
    await user.type(screen.getByRole('textbox', { name: /UKC club number/ }), 'U-9');
    await user.click(saveButton());

    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('club-1', { UKC: 'U-9' }));
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves the club and the numbers together when both changed', async () => {
    const user = userEvent.setup();
    const { onSave } = renderPanel();
    await loadedAkc();
    await user.type(screen.getByRole('textbox', { name: /ASCA club number/ }), 'A-1');
    await user.type(screen.getByRole('textbox', { name: /Club Name/ }), ' Club');
    await user.click(saveButton());

    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('club-1', { ASCA: 'A-1' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Heartland Club' }),
      expect.anything()
    );
  });

  it('refuses to clear the last number and writes nothing', async () => {
    const user = userEvent.setup();
    const { onSave, onClose } = renderPanel();
    await loadedAkc();
    await user.clear(await loadedAkc());
    await user.click(saveButton());

    expect(await screen.findByText('Enter at least one club number.')).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('writes the numbers before the club row', async () => {
    const user = userEvent.setup();
    const { onSave } = renderPanel();
    await loadedAkc();
    await user.type(screen.getByRole('textbox', { name: /UKC club number/ }), 'U-9');
    await user.type(screen.getByRole('textbox', { name: /Club Name/ }), ' Club');
    await user.click(saveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(
      onSave.mock.invocationCallOrder[0] as number
    );
  });

  it('writes nothing else and keeps the draft when the numbers cannot be saved', async () => {
    mocks.save.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    const { onSave, onClose } = renderPanel();
    await loadedAkc();
    await user.type(screen.getByRole('textbox', { name: /UKC club number/ }), 'U-9');
    await user.type(screen.getByRole('textbox', { name: /Club Name/ }), ' Club');
    await user.click(saveButton());

    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        "The club numbers couldn't be saved. Check your connection and try again."
      )
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: /UKC club number/ })).toHaveValue('U-9');
    expect(screen.getByRole('textbox', { name: /Club Name/ })).toHaveValue('Heartland Club');
  });

  it('keeps the panel open and says the numbers saved when the club row then fails', async () => {
    const user = userEvent.setup();
    const { onSave, onClose } = renderPanel();
    onSave.mockRejectedValueOnce(new Error('store failed'));
    await loadedAkc();
    await user.type(screen.getByRole('textbox', { name: /UKC club number/ }), 'U-9');
    await user.type(screen.getByRole('textbox', { name: /Club Name/ }), ' Club');
    await user.click(saveButton());

    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        "Club numbers saved. The club details couldn't be saved; try again."
      )
    );
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: /Club Name/ })).toHaveValue('Heartland Club');

    await user.click(saveButton());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it('disables the fields and says why when offline, without blocking the club save', async () => {
    mocks.online.value = false;
    const user = userEvent.setup();
    const { onSave } = renderPanel();
    expect(await loadedAkc()).toBeDisabled();
    expect(await screen.findByText(/Club numbers need a connection/)).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /Club Name/ }), ' Club');
    await user.click(saveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('shows the fields disabled while loading', async () => {
    mocks.get.mockReturnValue(new Promise(() => {}));
    renderPanel();
    expect(await screen.findByText('Loading club numbers…')).toBeInTheDocument();
    expect(await akc()).toBeDisabled();
  });

  it('explains a failed load, offers Try again, and still lets the club save', async () => {
    mocks.get.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    const { onSave } = renderPanel();
    expect(await screen.findByText(/couldn't load the club numbers/)).toBeInTheDocument();
    expect(await akc()).toBeDisabled();

    mocks.get.mockResolvedValue({ AKC: '4521' });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(loadedAkc()).resolves.toBeEnabled());

    await user.type(screen.getByRole('textbox', { name: /Club Name/ }), ' Club');
    await user.click(saveButton());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it('shows no number fields when adding a club, and points at Edit Club', async () => {
    renderPanel('create');
    expect(await screen.findByText(/from Edit Club on the club page/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/club number/i)).not.toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('saves a number on a club whose other profile fields are still blank, leaving the row alone', async () => {
    const user = userEvent.setup();
    const { onSave } = renderPanel('edit', { id: 'club-1', name: 'Heartland' });
    await loadedAkc();
    await user.type(screen.getByRole('textbox', { name: /UKC club number/ }), 'U-9');
    await user.click(saveButton());

    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('club-1', { UKC: 'U-9' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not rewrite the club row for a number edit when the stored website normalizes', async () => {
    const user = userEvent.setup();
    const { onSave } = renderPanel('edit', { ...CLUB, website: 'https://example.org' });
    await loadedAkc();
    await user.type(screen.getByRole('textbox', { name: /UKC club number/ }), 'U-9');
    await user.click(saveButton());

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('writes nothing and keeps the draft when the connection drops with a number change', async () => {
    const user = userEvent.setup();
    const { onSave, onClose } = renderPanel();
    await loadedAkc();
    await user.type(screen.getByRole('textbox', { name: /UKC club number/ }), 'U-9');
    mocks.online.value = false;
    await user.type(screen.getByRole('textbox', { name: /Club Name/ }), ' Club');
    await user.click(saveButton());

    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        'Club numbers need a connection. Reconnect, or undo the number change.'
      )
    );
    expect(mocks.save).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: /UKC club number/ })).toHaveValue('U-9');
  });

  it('lets the admin undo the number change and then save the club offline', async () => {
    const user = userEvent.setup();
    const { onSave } = renderPanel();
    await loadedAkc();
    await user.type(screen.getByRole('textbox', { name: /UKC club number/ }), 'U-9');
    mocks.online.value = false;
    await user.type(screen.getByRole('textbox', { name: /Club Name/ }), ' Club');
    await user.click(screen.getByRole('button', { name: 'Undo number changes' }));
    expect(screen.getByRole('textbox', { name: /UKC club number/ })).toHaveValue('');
    await user.click(saveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
