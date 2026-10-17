/**
 * MYK9-1235: the Club numbers section on the club page. Registry numbers are
 * online-only data, so they are edited here, not in the offline-first Edit Club panel.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTestQueryClient, render } from '@/test/utils/testUtils';
import { queryKeys } from '@/lib/queryClient';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  online: { value: true },
  success: vi.fn(),
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
vi.mock('@/lib/notifications', () => ({
  notifications: { success: mocks.success, error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { ClubNumbersSection } from '../ClubNumbersSection';

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Edit' }));
  return screen.findByRole('dialog');
}

describe('ClubNumbersSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.online.value = true;
    mocks.get.mockResolvedValue({ AKC: '4521' });
    mocks.save.mockResolvedValue(undefined);
  });

  it('does not repeat the numbers the header already shows', async () => {
    mocks.get.mockResolvedValue({ UKC: 'U-9', AKC: '4521' });
    render(<ClubNumbersSection clubId="club-1" canEdit />);

    expect(await screen.findByText('AKC, UKC and ASCA')).toBeInTheDocument();
    expect(screen.queryByText('AKC #4521 · UKC #U-9')).not.toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('club-1');
  });

  it('says "None yet" to an editor when the club has no numbers', async () => {
    mocks.get.mockResolvedValue({});
    render(<ClubNumbersSection clubId="club-1" canEdit />);

    expect(await screen.findByText('None yet')).toBeInTheDocument();
  });

  it('renders nothing without edit permission (the header shows the numbers)', () => {
    const { container } = render(<ClubNumbersSection clubId="club-1" canEdit={false} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('prefills the dialog from the loaded numbers', async () => {
    const user = userEvent.setup();
    render(<ClubNumbersSection clubId="club-1" canEdit />);

    const dialog = await openDialog(user);
    expect(await within(dialog).findByLabelText('AKC club number')).toHaveValue('4521');
    expect(within(dialog).getByLabelText('UKC club number')).toHaveValue('');
    expect(within(dialog).getByLabelText('ASCA club number')).toHaveValue('');
  });

  it('sends only the field the user edited, once', async () => {
    const user = userEvent.setup();
    render(<ClubNumbersSection clubId="club-1" canEdit />);

    const dialog = await openDialog(user);
    await user.type(await within(dialog).findByLabelText('UKC club number'), ' U-9 ');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save).toHaveBeenCalledWith('club-1', { UKC: ' U-9 ' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('writes nothing when nothing changed', async () => {
    const user = userEvent.setup();
    render(<ClubNumbersSection clubId="club-1" canEdit />);

    const dialog = await openDialog(user);
    await within(dialog).findByLabelText('AKC club number');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('refuses to clear the last number', async () => {
    const user = userEvent.setup();
    render(<ClubNumbersSection clubId="club-1" canEdit />);

    const dialog = await openDialog(user);
    await user.clear(await within(dialog).findByLabelText('AKC club number'));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByText('Enter at least one club number.')).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('shows a calm error with Retry that refetches when the read fails', async () => {
    const user = userEvent.setup();
    mocks.get.mockRejectedValueOnce(new Error('network')).mockResolvedValue({ AKC: '4521' });
    render(<ClubNumbersSection clubId="club-1" canEdit />);

    const dialog = await openDialog(user);
    expect(await within(dialog).findByText(/couldn't load the club numbers/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Retry' }));

    expect(await within(dialog).findByLabelText('AKC club number')).toHaveValue('4521');
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it('keeps an unsaved edit when a background refresh fails', async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    render(<ClubNumbersSection clubId="club-1" canEdit />, { queryClient });

    const dialog = await openDialog(user);
    await user.type(await within(dialog).findByLabelText('UKC club number'), 'U-9');

    mocks.get.mockRejectedValue(new Error('network'));
    await queryClient.refetchQueries({ queryKey: queryKeys.clubRegistryNumbers('club-1') });

    expect(
      await within(dialog).findByText(/couldn't refresh the club numbers/i)
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('UKC club number')).toHaveValue('U-9');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('club-1', { UKC: 'U-9' }));
  });

  it('follows a successful refresh in fields the user has not touched', async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    render(<ClubNumbersSection clubId="club-1" canEdit />, { queryClient });

    const dialog = await openDialog(user);
    await user.type(await within(dialog).findByLabelText('ASCA club number'), 'A-1');

    mocks.get.mockResolvedValue({ AKC: '4521', UKC: 'U-9' });
    await queryClient.refetchQueries({ queryKey: queryKeys.clubRegistryNumbers('club-1') });

    expect(await within(dialog).findByDisplayValue('U-9')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('ASCA club number')).toHaveValue('A-1');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('club-1', { ASCA: 'A-1' }));
  });

  it('disables Save and says why when offline', async () => {
    const user = userEvent.setup();
    mocks.online.value = false;
    render(<ClubNumbersSection clubId="club-1" canEdit />);

    const dialog = await openDialog(user);
    await within(dialog).findByLabelText('AKC club number');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(within(dialog).getByText('Club numbers need a connection.')).toBeInTheDocument();
  });
});
