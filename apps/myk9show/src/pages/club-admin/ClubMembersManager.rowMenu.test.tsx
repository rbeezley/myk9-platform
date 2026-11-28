/**
 * MYK9-2364 (PR A): every admin, show secretary and officer-title grant and removal is reachable
 * from a person's row menu in the one list, and each calls the same service the tabs call.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import { ClubMembersManager } from './ClubMembersManager';

const m = vi.hoisted(() => ({
  getClubAdmins: vi.fn(),
  addClubAdminByEmail: vi.fn(),
  removeClubAdmin: vi.fn(),
  getClubShowManagers: vi.fn(),
  setClubShowManagerAccess: vi.fn(),
  getClubOfficers: vi.fn(),
  addClubOfficer: vi.fn(),
  removeClubOfficer: vi.fn(),
  refreshPermissions: vi.fn(),
  navigate: vi.fn(),
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
  databaseUserId: { value: 'person-1' },
}));

vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => m.navigate,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    getUserRoles: () => ['club_admin'],
    hasRole: () => false,
    refreshPermissions: m.refreshPermissions,
    userWithRoles: {
      databaseUserId: m.databaseUserId.value,
      scopes: [{ scopeType: 'club', roleId: 'club_admin', scopeId: 'club-1' }],
    },
  }),
}));

vi.mock('@/store/userStore', () => ({
  useUserStore: () => ({ people: [], loadUsers: vi.fn() }),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { success: m.notifySuccess, error: m.notifyError },
}));

vi.mock('@/services/database/clubs', () => ({
  countUpcomingClubShows: vi.fn(() => Promise.resolve(0)),
}));

vi.mock('@/services/database/club-memberships', () => ({
  getClubMembers: vi.fn(() =>
    Promise.resolve([
      {
        id: 'member-1',
        clubId: 'club-1',
        personId: 'person-1',
        personName: 'Ada Lovelace',
        personEmail: 'ada@example.com',
        membershipType: 'full',
        membershipStatus: 'active',
        joinedDate: '2026-01-01',
      },
      {
        id: 'member-2',
        clubId: 'club-1',
        personId: 'person-2',
        personName: 'Grace Hopper',
        personEmail: undefined,
        membershipType: 'associate',
        membershipStatus: 'active',
        joinedDate: '2026-02-01',
      },
    ])
  ),
  countActiveClubMembers: vi.fn(() => 2),
  addClubMember: vi.fn(),
  updateClubMember: vi.fn(),
  removeClubMember: vi.fn(),
  getClubAdmins: m.getClubAdmins,
  addClubAdminByEmail: m.addClubAdminByEmail,
  removeClubAdmin: m.removeClubAdmin,
  getClubShowManagers: m.getClubShowManagers,
  setClubShowManagerAccess: m.setClubShowManagerAccess,
  getClubOfficers: m.getClubOfficers,
  addClubOfficer: m.addClubOfficer,
  removeClubOfficer: m.removeClubOfficer,
}));

const officer = (id: string, personId: string | null, position: string, personName: string) => ({
  id,
  clubId: 'club-1',
  personId,
  position,
  termStart: null,
  termEnd: null,
  electedDate: null,
  personName,
});

function renderList() {
  return render(<ClubMembersManager clubId="club-1" clubName="Heartland Club" />);
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name: `Actions for ${name}` }));
  return screen.findByRole('menu');
}

describe('ClubMembersManager row menu: admin, show secretary and officer titles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.databaseUserId.value = 'person-1';
    m.getClubAdmins.mockResolvedValue([
      { personId: 'person-1', personName: 'Ada Lovelace', personEmail: 'ada@example.com' },
      { personId: 'person-9', personName: 'Nina Outsider', personEmail: 'nina@example.com' },
    ]);
    m.getClubShowManagers.mockResolvedValue([
      {
        personId: 'person-8',
        personName: 'Pat Secretary',
        personEmail: 'pat@example.com',
        isClubMember: false,
        membershipStatus: null,
      },
    ]);
    m.getClubOfficers.mockResolvedValue([
      officer('o-1', 'person-1', 'president', 'Ada Lovelace'),
      officer('o-2', 'person-1', 'treasurer', 'Ada Lovelace'),
      officer('o-3', null, 'secretary', 'Sam Typed'),
    ]);
    m.refreshPermissions.mockResolvedValue(undefined);
  });

  it('shows one row per person with role badges, and "Not a club member" for non-members', async () => {
    renderList();
    const adaRow = (await screen.findByText('Ada Lovelace')).closest('tr')!;
    expect(within(adaRow).getByText('Admin')).toBeInTheDocument();
    expect(within(adaRow).getByText('President')).toBeInTheDocument();
    expect(within(adaRow).getByText('Treasurer')).toBeInTheDocument();
    expect(screen.getAllByText('Ada Lovelace')).toHaveLength(1);

    const ninaRow = (await screen.findByText('Nina Outsider')).closest('tr')!;
    expect(within(ninaRow).getByText('Admin')).toBeInTheDocument();
    expect(within(ninaRow).getByText('Not a club member')).toBeInTheDocument();

    const patRow = screen.getByText('Pat Secretary').closest('tr')!;
    expect(within(patRow).getByText('Show secretary')).toBeInTheDocument();

    const samRow = screen.getByText('Sam Typed').closest('tr')!;
    expect(within(samRow).getByText('Club secretary')).toBeInTheDocument();
    expect(within(samRow).getByText('Not a club member')).toBeInTheDocument();
  });

  it('Make admin asks first, then calls addClubAdminByEmail with the club and that email', async () => {
    m.getClubAdmins.mockResolvedValue([]);
    m.addClubAdminByEmail.mockResolvedValue('added');
    const user = userEvent.setup();
    renderList();
    await openMenu(user, 'Ada Lovelace');

    await user.click(screen.getByRole('menuitem', { name: 'Make admin' }));
    expect(m.addClubAdminByEmail).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Add ada@example.com as an admin of Heartland Club?');
    await user.click(within(dialog).getByRole('button', { name: 'Add admin' }));

    await waitFor(() =>
      expect(m.addClubAdminByEmail).toHaveBeenCalledWith('club-1', 'ada@example.com')
    );
    await waitFor(() =>
      expect(m.notifySuccess).toHaveBeenCalledWith('ada@example.com is now an admin of this club.')
    );
  });

  it('Make admin is disabled, with its reason, for a person with no email', async () => {
    m.getClubAdmins.mockResolvedValue([]);
    const user = userEvent.setup();
    renderList();
    await openMenu(user, 'Grace Hopper');

    const item = screen.getByRole('menuitem', { name: /Make admin/ });
    expect(item).toHaveAttribute('data-disabled');
    expect(item).toHaveTextContent('no email on file');
    await user.click(item);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(m.addClubAdminByEmail).not.toHaveBeenCalled();
  });

  it('Make admin reports an address with no account the way the Admins tab does', async () => {
    m.getClubAdmins.mockResolvedValue([]);
    m.addClubAdminByEmail.mockResolvedValue('no_account');
    const user = userEvent.setup();
    renderList();
    await openMenu(user, 'Ada Lovelace');
    await user.click(screen.getByRole('menuitem', { name: 'Make admin' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Add admin' })
    );

    await waitFor(() =>
      expect(m.notifyError).toHaveBeenCalledWith(
        "We couldn't add ada@example.com. Check the address, and make sure they have a myK9 account they have signed in to, then try again."
      )
    );
  });

  it('Remove admin asks first, then calls removeClubAdmin with the club and person', async () => {
    m.removeClubAdmin.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderList();
    await openMenu(user, 'Nina Outsider');

    await user.click(screen.getByRole('menuitem', { name: 'Remove admin' }));
    expect(m.removeClubAdmin).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Remove Nina Outsider as an admin?');
    await user.click(within(dialog).getByRole('button', { name: 'Remove admin' }));

    await waitFor(() => expect(m.removeClubAdmin).toHaveBeenCalledWith('club-1', 'person-9'));
    await waitFor(() => expect(m.notifySuccess).toHaveBeenCalledWith('Admin removed.'));
    expect(m.navigate).not.toHaveBeenCalled();
  });

  it('Remove admin shows the last-admin refusal in plain words', async () => {
    m.removeClubAdmin.mockRejectedValue({
      message: 'A club needs at least one admin. Add another admin first.',
      code: 'P0001',
    });
    const user = userEvent.setup();
    renderList();
    await openMenu(user, 'Nina Outsider');
    await user.click(screen.getByRole('menuitem', { name: 'Remove admin' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove admin' })
    );

    await waitFor(() =>
      expect(m.notifyError).toHaveBeenCalledWith(
        'A club needs at least one admin. Add another admin first.'
      )
    );
  });

  it('removing yourself as admin leaves the page and refreshes permissions', async () => {
    m.removeClubAdmin.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderList();
    await openMenu(user, 'Ada Lovelace');
    await user.click(screen.getByRole('menuitem', { name: 'Remove admin' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove admin' })
    );

    await waitFor(() => expect(m.removeClubAdmin).toHaveBeenCalledWith('club-1', 'person-1'));
    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/clubs/club-1'));
    expect(m.refreshPermissions).toHaveBeenCalled();
  });

  it('Appoint show secretary calls setClubShowManagerAccess with grant true', async () => {
    m.setClubShowManagerAccess.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderList();
    await openMenu(user, 'Grace Hopper');

    await user.click(screen.getByRole('menuitem', { name: 'Appoint show secretary' }));
    await waitFor(() =>
      expect(m.setClubShowManagerAccess).toHaveBeenCalledWith({
        clubId: 'club-1',
        personId: 'person-2',
        grant: true,
      })
    );
  });

  it('Revoke show secretary on a non-member waits for the confirm, then sends grant false', async () => {
    m.setClubShowManagerAccess.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderList();
    await openMenu(user, 'Pat Secretary');

    expect(
      screen.queryByRole('menuitem', { name: /Change Type|Remove Member/ })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Revoke show secretary' }));
    expect(m.setClubShowManagerAccess).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Revoke show secretary from Pat Secretary?');
    await user.click(within(dialog).getByRole('button', { name: 'Revoke show secretary' }));

    await waitFor(() =>
      expect(m.setClubShowManagerAccess).toHaveBeenCalledWith({
        clubId: 'club-1',
        personId: 'person-8',
        grant: false,
      })
    );
  });

  it('Set officer title opens the dialog with the person fixed and calls addClubOfficer', async () => {
    m.addClubOfficer.mockResolvedValue({});
    const user = userEvent.setup();
    renderList();
    await openMenu(user, 'Grace Hopper');

    await user.click(screen.getByRole('menuitem', { name: 'Set officer title' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Set officer title for Grace Hopper',
    });
    expect(
      within(dialog).queryByLabelText('Not on myK9Show? Type their name')
    ).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Position'), 'vice_president');
    await user.click(within(dialog).getByRole('button', { name: 'Assign Officer' }));

    await waitFor(() =>
      expect(m.addClubOfficer).toHaveBeenCalledWith({
        clubId: 'club-1',
        personId: 'person-2',
        position: 'vice_president',
      })
    );
  });

  it('a duplicate title says so in plain words', async () => {
    m.addClubOfficer.mockRejectedValue({ code: '23505' });
    const user = userEvent.setup();
    renderList();
    await openMenu(user, 'Ada Lovelace');
    await user.click(screen.getByRole('menuitem', { name: 'Set officer title' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Set officer title for Ada Lovelace',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Assign Officer' }));

    await waitFor(() =>
      expect(m.notifyError).toHaveBeenCalledWith(
        'That person already holds this position, or we could not save the change.'
      )
    );
  });

  it('Remove <title> asks first, then calls removeClubOfficer for that title only', async () => {
    m.removeClubOfficer.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderList();
    await openMenu(user, 'Ada Lovelace');

    expect(screen.getByRole('menuitem', { name: 'Remove President' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Remove Treasurer' }));
    expect(m.removeClubOfficer).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Remove Ada Lovelace from this position?');
    m.getClubOfficers.mockResolvedValue([
      officer('o-1', 'person-1', 'president', 'Ada Lovelace'),
      officer('o-3', null, 'secretary', 'Sam Typed'),
    ]);
    await user.click(within(dialog).getByRole('button', { name: 'Remove officer' }));

    await waitFor(() => expect(m.removeClubOfficer).toHaveBeenCalledWith('o-2'));
    await waitFor(() => expect(screen.queryByText('Treasurer')).not.toBeInTheDocument());
    expect(screen.getByText('President')).toBeInTheDocument();
  });

  it('a typed-name officer row has only the remove-title item', async () => {
    const user = userEvent.setup();
    renderList();
    await openMenu(user, 'Sam Typed');

    expect(screen.getByRole('menuitem', { name: 'Remove Club secretary' })).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /Make admin|Set officer title|Remove Member|Appoint/ })
    ).not.toBeInTheDocument();
  });

  it('an admin list that failed to load shows admin badges as unknown, not absent', async () => {
    m.getClubAdmins.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    renderList();

    const adaRow = (await screen.findByText('Ada Lovelace')).closest('tr')!;
    await waitFor(() => expect(within(adaRow).getByText('Admin unknown')).toBeInTheDocument());
    expect(within(adaRow).queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.getByText(/couldn't load the admins list/)).toBeInTheDocument();
    expect(screen.queryByText('Nina Outsider')).not.toBeInTheDocument();

    await openMenu(user, 'Ada Lovelace');
    expect(screen.getByRole('menuitem', { name: 'Admin list unavailable' })).toHaveAttribute(
      'data-disabled'
    );
    expect(
      screen.queryByRole('menuitem', { name: /Make admin|Remove admin/ })
    ).not.toBeInTheDocument();
  });

  it('a show secretary list that failed to load shows the badge as unknown, not absent', async () => {
    m.getClubShowManagers.mockRejectedValue(new Error('network'));
    renderList();

    const adaRow = (await screen.findByText('Ada Lovelace')).closest('tr')!;
    await waitFor(() =>
      expect(within(adaRow).getByText('Show secretary unknown')).toBeInTheDocument()
    );
    expect(screen.getByText(/couldn't load show secretaries/)).toBeInTheDocument();
  });
});
