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
  // What the editor's cached query holds; null means "same as the server".
  cached: null as null | undefined | Record<string, unknown[]>,
  fetchError: null as Error | null,
}));

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { rpc: harness.rpc } }));
vi.mock('@/lib/notifications', () => ({
  notifications: { success: harness.success, error: harness.error },
}));
vi.mock('@/hooks/queries/useShowOfficials', () => ({
  useShowOfficials: () => ({
    data: harness.cached === null ? harness.officials : harness.cached,
    isLoading: false,
  }),
  fetchShowOfficials: async () => {
    if (harness.fetchError) throw harness.fetchError;
    return harness.officials;
  },
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
  mailingAddress: null as string | null,
});

const SHOW = 'show-1';

describe('ShowOfficialsEditor replace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.rpc.mockResolvedValue({ error: null });
    harness.officials = { secretaries: [], chairmen: [], stewards: [] };
    harness.cached = null;
    harness.fetchError = null;
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

    await waitFor(() => expect(harness.error).toHaveBeenCalledWith('Failed to assign role: nope'));
    expect(harness.rpc).not.toHaveBeenCalledWith('revoke_show_official', expect.anything());
    expect(harness.success).not.toHaveBeenCalled();
  });

  it('revokes the holder the server has even when the cached list is empty', async () => {
    harness.officials.chairmen = [holder('old-1', 'Caleb', 'Morgan')];
    harness.cached = undefined; // query failed or offline: the editor has no list
    renderWithProviders(<ShowOfficialsEditor showId={SHOW} />);
    await userEvent.click(screen.getByText('pick Chair'));

    await waitFor(() => expect(harness.success).toHaveBeenCalledWith('Official assigned'));
    expect(harness.rpc).toHaveBeenCalledWith('revoke_show_official', {
      p_person_id: 'old-1',
      p_role_name: 'chairman',
      p_show_id: SHOW,
    });
  });

  it('grants nothing when the current officials cannot be read', async () => {
    harness.fetchError = new Error('offline');
    renderWithProviders(<ShowOfficialsEditor showId={SHOW} />);
    await userEvent.click(screen.getByText('pick Chair'));

    await waitFor(() =>
      expect(harness.error).toHaveBeenCalledWith('Failed to assign role: offline')
    );
    expect(harness.rpc).not.toHaveBeenCalled();
    expect(harness.success).not.toHaveBeenCalled();
  });

  it('names only the holders whose revoke failed, in the plural', async () => {
    harness.officials.chairmen = [
      holder('old-1', 'Caleb', 'Morgan'),
      holder('old-2', 'Liz', 'Beezley'),
      holder('old-3', 'Pat', 'Kerr'),
    ];
    harness.rpc.mockImplementation(async (name: string, args: { p_person_id: string }) => {
      if (name !== 'revoke_show_official') return { error: null };
      if (args.p_person_id === 'old-2') return { error: null };
      if (args.p_person_id === 'old-3') throw new Error('network');
      return { error: { message: 'denied' } };
    });
    renderWithProviders(<ShowOfficialsEditor showId={SHOW} />);
    await userEvent.click(screen.getByText('pick Chair'));

    await waitFor(() =>
      expect(harness.error).toHaveBeenCalledWith(
        'Alex Whitfield is now Chair, but Caleb Morgan, Pat Kerr are still listed. Try again.'
      )
    );
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

describe('ShowOfficialsEditor mailing address for the premium (MYK9-2065)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.rpc.mockResolvedValue({ error: null });
    harness.officials = { secretaries: [], chairmen: [], stewards: [] };
    harness.cached = null;
    harness.fetchError = null;
  });

  it('offers no field until a Chair or Secretary is named', () => {
    renderWithProviders(<ShowOfficialsEditor showId={SHOW} />);
    expect(screen.queryByLabelText(/Mailing address for the premium/)).toBeNull();
  });

  it('saves what is typed for the Chair when the field loses focus', async () => {
    harness.officials.chairmen = [holder('c1', 'Caleb', 'Morgan')];
    renderWithProviders(<ShowOfficialsEditor showId={SHOW} />);

    const field = screen.getByLabelText('Chair: Mailing address for the premium');
    await userEvent.type(field, 'PO Box 77');
    await userEvent.tab();

    await waitFor(() =>
      expect(harness.rpc).toHaveBeenCalledWith('set_show_official_mailing_address', {
        p_show_id: SHOW,
        p_role_name: 'chairman',
        p_address: 'PO Box 77',
      })
    );
    expect(harness.success).toHaveBeenCalledWith('Chair mailing address saved');
  });

  it('starts from the saved address and clears it when emptied', async () => {
    harness.officials.secretaries = [{ ...holder('s1', 'Sam', 'Sec'), mailingAddress: 'PO Box 9' }];
    renderWithProviders(<ShowOfficialsEditor showId={SHOW} />);

    const field = screen.getByLabelText('Secretary: Mailing address for the premium');
    expect(field).toHaveValue('PO Box 9');
    await userEvent.clear(field);
    await userEvent.tab();

    await waitFor(() =>
      expect(harness.rpc).toHaveBeenCalledWith('set_show_official_mailing_address', {
        p_show_id: SHOW,
        p_role_name: 'secretary',
        p_address: '',
      })
    );
  });

  it('does not call the server when nothing changed, and says so when a save fails', async () => {
    harness.officials.chairmen = [
      { ...holder('c1', 'Caleb', 'Morgan'), mailingAddress: 'PO Box 1' },
    ];
    renderWithProviders(<ShowOfficialsEditor showId={SHOW} />);
    const field = screen.getByLabelText('Chair: Mailing address for the premium');

    await userEvent.click(field);
    await userEvent.tab();
    expect(harness.rpc).not.toHaveBeenCalled();

    harness.rpc.mockResolvedValue({ error: { message: 'denied' } });
    await userEvent.type(field, 'x');
    await userEvent.tab();
    await waitFor(() =>
      expect(harness.error).toHaveBeenCalledWith('Could not save the Chair mailing address: denied')
    );
  });
});
