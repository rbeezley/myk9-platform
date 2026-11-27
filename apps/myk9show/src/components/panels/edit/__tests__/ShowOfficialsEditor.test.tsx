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

    await waitFor(() =>
      expect(harness.success).toHaveBeenCalledWith('Alex Whitfield is now Chair.')
    );
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

    await waitFor(() =>
      expect(harness.success).toHaveBeenCalledWith('Alex Whitfield is now Chair.')
    );
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
        p_person_id: 'c1',
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
        p_person_id: 's1',
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

  it('says the official changed when the server reports the saved person is no longer named', async () => {
    harness.officials.chairmen = [holder('c1', 'Caleb', 'Morgan')];
    harness.rpc.mockResolvedValue({ error: { code: 'P0002', message: 'raw server text' } });
    renderWithProviders(<ShowOfficialsEditor showId={SHOW} />);

    await userEvent.type(
      screen.getByLabelText('Chair: Mailing address for the premium'),
      'PO Box 7'
    );
    await userEvent.tab();

    await waitFor(() =>
      expect(harness.error).toHaveBeenCalledWith(
        'This official was changed by someone else. Refresh this page to see who it is now.'
      )
    );
  });

  it('says to reconnect when the browser is offline', async () => {
    harness.officials.chairmen = [holder('c1', 'Caleb', 'Morgan')];
    harness.rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    const online = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    renderWithProviders(<ShowOfficialsEditor showId={SHOW} />);

    await userEvent.type(
      screen.getByLabelText('Chair: Mailing address for the premium'),
      'PO Box 7'
    );
    await userEvent.tab();

    await waitFor(() =>
      expect(harness.error).toHaveBeenCalledWith('You are offline. Reconnect to save this address.')
    );
    online.mockRestore();
  });

  it('shows a refreshed server address in a clean field but keeps an unsaved draft', async () => {
    harness.officials.chairmen = [
      { ...holder('c1', 'Caleb', 'Morgan'), mailingAddress: 'PO Box 1' },
    ];
    const view = renderWithProviders(<ShowOfficialsEditor showId={SHOW} />);
    const label = 'Chair: Mailing address for the premium';
    expect(screen.getByLabelText(label)).toHaveValue('PO Box 1');

    harness.officials = {
      ...harness.officials,
      chairmen: [{ ...holder('c1', 'Caleb', 'Morgan'), mailingAddress: 'PO Box 2' }],
    };
    view.rerender(<ShowOfficialsEditor showId={SHOW} />);
    expect(screen.getByLabelText(label)).toHaveValue('PO Box 2');

    await userEvent.type(screen.getByLabelText(label), 'x');
    harness.officials = {
      ...harness.officials,
      chairmen: [{ ...holder('c1', 'Caleb', 'Morgan'), mailingAddress: 'PO Box 3' }],
    };
    view.rerender(<ShowOfficialsEditor showId={SHOW} />);
    expect(screen.getByLabelText(label)).toHaveValue('PO Box 2x');
  });

  // MYK9-2470: a pick saves at once and the panel's Save Changes stays disabled, so the answer
  // has to be under the picker she just used.
  describe('saved and failed notes under the picker', () => {
    it('says who is now Secretary, under the picker and on the toast', async () => {
      harness.officials.secretaries = [holder('old-1', 'Jordan', 'Ellis')];
      renderWithProviders(<ShowOfficialsEditor showId={SHOW} />);
      await userEvent.click(screen.getByText('pick Secretary'));

      expect(
        await screen.findByText('Saved. Alex Whitfield is now Secretary.')
      ).toBeInTheDocument();
      expect(harness.success).toHaveBeenCalledWith('Alex Whitfield is now Secretary.');
      expect(screen.getAllByRole('status')).toHaveLength(1);
    });

    it('confirms a Steward the same way', async () => {
      renderWithProviders(<ShowOfficialsEditor showId={SHOW} />);
      await userEvent.click(screen.getByText('pick Steward'));

      expect(await screen.findByText('Saved. Alex Whitfield is now Steward.')).toBeInTheDocument();
    });

    it('says under the picker that the role was not changed when the save fails', async () => {
      harness.officials.chairmen = [holder('old-1', 'Caleb', 'Morgan')];
      harness.rpc.mockResolvedValue({ error: { message: 'nope' } });
      renderWithProviders(<ShowOfficialsEditor showId={SHOW} />);
      await userEvent.click(screen.getByText('pick Chair'));

      expect(await screen.findByText('Chair was not changed. Try again.')).toBeInTheDocument();
      expect(screen.queryByText(/^Saved\./)).not.toBeInTheDocument();
    });

    it('shows a half-finished replace under the picker, not as saved', async () => {
      harness.officials.chairmen = [holder('old-1', 'Caleb', 'Morgan')];
      harness.rpc.mockImplementation(async (name: string) =>
        name === 'revoke_show_official' ? { error: { message: 'denied' } } : { error: null }
      );
      renderWithProviders(<ShowOfficialsEditor showId={SHOW} />);
      await userEvent.click(screen.getByText('pick Chair'));

      expect(
        await screen.findByText(
          'Alex Whitfield is now Chair, but Caleb Morgan is still listed. Try again.'
        )
      ).toBeInTheDocument();
      expect(screen.queryByText(/^Saved\./)).not.toBeInTheDocument();
    });

    it('clears the last note for a role when it is picked again', async () => {
      harness.rpc.mockResolvedValueOnce({ error: { message: 'nope' } });
      renderWithProviders(<ShowOfficialsEditor showId={SHOW} />);
      await userEvent.click(screen.getByText('pick Steward'));
      expect(await screen.findByText('Steward was not changed. Try again.')).toBeInTheDocument();

      await userEvent.click(screen.getByText('pick Steward'));

      expect(await screen.findByText('Saved. Alex Whitfield is now Steward.')).toBeInTheDocument();
      expect(screen.queryByText('Steward was not changed. Try again.')).not.toBeInTheDocument();
    });
  });
});
