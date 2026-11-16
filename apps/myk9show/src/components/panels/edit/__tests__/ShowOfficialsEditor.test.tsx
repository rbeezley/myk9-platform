import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils/testUtils';

const harness = vi.hoisted(() => ({
  rpc: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  officials: {
    secretaries: [] as unknown[],
    chairmen: [] as unknown[],
    stewards: [] as unknown[],
  },
}));

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { rpc: harness.rpc } }));
vi.mock('@/lib/notifications', () => ({
  notifications: { success: harness.success, error: harness.error },
}));
vi.mock('@/hooks/queries/useShowOfficials', () => ({
  useShowOfficials: () => ({ data: harness.officials, isLoading: false }),
}));
vi.mock('@/store/userStore', () => ({
  useUserStore: () => ({
    people: [{ id: 'new-person', firstName: 'Alex', lastName: 'Whitfield' }],
    loadPeople: vi.fn(),
    loadUsers: vi.fn(),
  }),
}));
vi.mock('@/components/committee/ShowCommitteeEditor', () => ({ ShowCommitteeEditor: () => null }));
vi.mock('@/components/shows/wizard/steps/OfficialPicker', () => ({
  OfficialPicker: ({
    label,
    onSelect,
  }: {
    label: string;
    onSelect: (id: string) => Promise<void>;
  }) => <button onClick={() => void onSelect('new-person')}>{`pick ${label}`}</button>,
}));

import { ShowOfficialsEditor } from '../ShowOfficialsEditor';

const holder = (personId: string, firstName: string, lastName: string) => ({
  personId,
  firstName,
  lastName,
  email: null,
});

const SHOW = 'show-1';

describe('ShowOfficialsEditor replace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.rpc.mockResolvedValue({ error: null });
    harness.officials = { secretaries: [], chairmen: [], stewards: [] };
  });

  it('assigning a second Chair revokes the first', async () => {
    harness.officials.chairmen = [holder('old-1', 'Caleb', 'Morgan')];
    renderWithProviders(<ShowOfficialsEditor showId={SHOW} />);
    await userEvent.click(screen.getByText('pick Chair'));

    await waitFor(() => expect(harness.success).toHaveBeenCalledWith('Official assigned'));
    expect(harness.rpc).toHaveBeenCalledWith('grant_show_official', {
      p_person_id: 'new-person',
      p_role_name: 'chairman',
      p_show_id: SHOW,
    });
    expect(harness.rpc).toHaveBeenCalledWith('revoke_show_official', {
      p_person_id: 'old-1',
      p_role_name: 'chairman',
      p_show_id: SHOW,
    });
  });

  it('revokes every prior holder of the role', async () => {
    harness.officials.secretaries = [holder('s1', 'A', 'One'), holder('s2', 'B', 'Two')];
    renderWithProviders(<ShowOfficialsEditor showId={SHOW} />);
    await userEvent.click(screen.getByText('pick Secretary'));

    await waitFor(() => expect(harness.success).toHaveBeenCalled());
    for (const id of ['s1', 's2']) {
      expect(harness.rpc).toHaveBeenCalledWith('revoke_show_official', {
        p_person_id: id,
        p_role_name: 'secretary',
        p_show_id: SHOW,
      });
    }
  });

  it('names who is still listed when a revoke fails, with no success toast', async () => {
    harness.officials.chairmen = [holder('old-1', 'Caleb', 'Morgan')];
    harness.rpc.mockImplementation(async (name: string) =>
      name === 'revoke_show_official' ? { error: { message: 'denied' } } : { error: null }
    );
    renderWithProviders(<ShowOfficialsEditor showId={SHOW} />);
    await userEvent.click(screen.getByText('pick Chair'));

    await waitFor(() =>
      expect(harness.error).toHaveBeenCalledWith(
        'Alex Whitfield is now Chair, but Caleb Morgan is still listed. Try again.'
      )
    );
    expect(harness.success).not.toHaveBeenCalled();
  });

  it('does not revoke anyone when the grant fails', async () => {
    harness.officials.chairmen = [holder('old-1', 'Caleb', 'Morgan')];
    harness.rpc.mockResolvedValue({ error: { message: 'nope' } });
    renderWithProviders(<ShowOfficialsEditor showId={SHOW} />);
    await userEvent.click(screen.getByText('pick Chair'));

    await waitFor(() => expect(harness.error).toHaveBeenCalled());
    expect(harness.rpc).not.toHaveBeenCalledWith('revoke_show_official', expect.anything());
    expect(harness.success).not.toHaveBeenCalled();
  });

  it('leaves stewards grant-only', async () => {
    harness.officials.stewards = [holder('st-1', 'Sam', 'Steward')];
    renderWithProviders(<ShowOfficialsEditor showId={SHOW} />);
    await userEvent.click(screen.getByText('pick Steward'));

    await waitFor(() => expect(harness.success).toHaveBeenCalled());
    expect(harness.rpc).toHaveBeenCalledTimes(1);
    expect(harness.rpc).toHaveBeenCalledWith('grant_show_official', expect.anything());
  });

  it('does nothing when the pick is already the only holder', async () => {
    harness.officials.chairmen = [holder('new-person', 'Alex', 'Whitfield')];
    renderWithProviders(<ShowOfficialsEditor showId={SHOW} />);
    await userEvent.click(screen.getByText('pick Chair'));

    await waitFor(() => expect(harness.success).toHaveBeenCalled());
    expect(harness.rpc).not.toHaveBeenCalled();
  });
});
