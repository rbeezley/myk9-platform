import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '@/test/utils/testUtils';
import { useShowStore } from '@/store/showStore';
import { ShowUsesSwitches } from './ShowUsesSwitches';

const hoisted = vi.hoisted(() => ({
  settings: { data: { selfCheckinEnabled: true } as { selfCheckinEnabled: boolean } | undefined },
  checkinMutate: vi.fn(),
  online: { value: true },
}));

vi.mock('@/hooks/queries/useShowSettingsDatabase', () => ({
  useShowSettings: () => hoisted.settings,
}));
vi.mock('@/hooks/mutations/useShowSettingsMutations', () => ({
  useUpdateShowCheckin: () => ({ mutate: hoisted.checkinMutate, isPending: false }),
}));
vi.mock('@/hooks/useNetworkStatus', () => ({ useIsOnline: () => hoisted.online.value }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const updateShow = vi.fn(async () => undefined);

function seedShow(flags: Record<string, boolean> = {}) {
  useShowStore.setState({ shows: [{ id: 'show-1', ...flags }], updateShow } as never);
}

describe('ShowUsesSwitches (MYK9-1685)', () => {
  beforeEach(() => {
    updateShow.mockClear();
    hoisted.checkinMutate.mockClear();
    hoisted.settings.data = { selfCheckinEnabled: true };
    hoisted.online.value = true;
    seedShow();
  });

  it('renders the heading and all six switches with their defaults', () => {
    render(<ShowUsesSwitches showId="show-1" />);

    expect(screen.getByRole('heading', { name: 'This show uses…' })).toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(6);
    expect(screen.getByRole('switch', { name: 'Exhibitor self check-in' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Judges score on devices' })).toBeChecked();
    // Unknown reads as on, like the Actions rows that stay visible until the value arrives.
    expect(screen.getByRole('switch', { name: 'Paper fallback packet' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Volunteer tracking' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Public landing page' })).not.toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'We publish our own premium list' })
    ).not.toBeChecked();
  });

  it.each([
    ['Judges score on devices', 'usesDeviceScoring', false, { usesDeviceScoring: true }],
    ['Paper fallback packet', 'usesPaperPacket', true, { usesPaperPacket: false }],
    ['Volunteer tracking', 'usesVolunteers', true, { usesVolunteers: false }],
    ['Public landing page', 'usesLandingPage', true, {}],
    ['We publish our own premium list', 'publishesOwnPremium', true, {}],
  ])('toggling "%s" saves %s=%s through updateShow', async (label, field, next, seed) => {
    seedShow(seed);
    render(<ShowUsesSwitches showId="show-1" />);

    await userEvent.click(screen.getByRole('switch', { name: label }));

    await waitFor(() => expect(updateShow).toHaveBeenCalledWith('show-1', { [field]: next }));
    expect(updateShow).toHaveBeenCalledTimes(1);
  });

  it('toggling self check-in calls the self check-in mutation, not updateShow', async () => {
    render(<ShowUsesSwitches showId="show-1" />);

    await userEvent.click(screen.getByRole('switch', { name: 'Exhibitor self check-in' }));

    expect(hoisted.checkinMutate).toHaveBeenCalledWith(
      { showId: 'show-1', enabled: false },
      expect.any(Object)
    );
    expect(updateShow).not.toHaveBeenCalled();
  });

  it('disables self check-in with a reason while offline, leaving the others editable', () => {
    hoisted.online.value = false;
    render(<ShowUsesSwitches showId="show-1" />);

    expect(screen.getByRole('switch', { name: 'Exhibitor self check-in' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByText(/Needs a connection to change/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Volunteer tracking' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('disables self check-in until its setting has loaded', () => {
    hoisted.settings.data = undefined;
    render(<ShowUsesSwitches showId="show-1" />);

    expect(screen.getByRole('switch', { name: 'Exhibitor self check-in' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });
});
