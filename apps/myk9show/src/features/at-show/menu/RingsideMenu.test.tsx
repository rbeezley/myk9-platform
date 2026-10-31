import { Routes, Route, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import { useNotificationStore } from '@/store/notificationStore';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
import { useRingsideReturnStore } from './ringsideReturnStore';

const mocks = vi.hoisted(() => ({
  auth: {
    hasRole: (_role: unknown): boolean => false,
    userWithRoles: null as unknown,
    user: { id: 'u1', is_anonymous: false } as { id: string; is_anonymous: boolean } | null,
    signOut: vi.fn(),
    getUserRoles: (): string[] => [],
  },
  online: true,
  canManage: false,
  show: { clubId: 'club-1', location: '123 Main St, Springfield' } as Record<string, unknown>,
}));

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => mocks.auth }));
vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({ canManage: mocks.canManage }),
}));
vi.mock('@/lib/networkUtils', () => ({ useOnlineStatus: () => mocks.online }));
vi.mock('@/hooks/useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: () => ({ status: 'synced', queueSize: 0 }),
}));
vi.mock('@/services/replication', () => ({
  replicatedShowsTable: { getShowById: vi.fn(async () => mocks.show) },
}));
vi.mock('@/hooks/queries/useShowOfficials', () => ({
  useShowOfficials: () => ({
    data: {
      secretaries: [
        { personId: 's1', firstName: 'Sam', lastName: 'Secretary', email: 'sam@example.com' },
      ],
      chairmen: [
        { personId: 'c1', firstName: 'Cher', lastName: 'Chair', email: 'cher@example.com' },
      ],
      stewards: [],
    },
  }),
}));
vi.mock('@/components/askq/AskQPanel', () => ({
  AskQPanel: () => <div data-testid="askq-panel" />,
}));

import { RingsideMenu } from './RingsideMenu';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderMenu(route = '/at-show/show-1/class/class-1') {
  return render(
    <>
      <Routes>
        <Route path="*" element={<RingsideMenu showId="show-1" />} />
      </Routes>
      <LocationProbe />
    </>,
    { initialRoute: route }
  );
}

async function openMenu(user: ReturnType<typeof renderMenu>['user']) {
  await user.click(screen.getByRole('button', { name: 'Ringside menu' }));
  return screen.findByRole('navigation', { name: 'Ringside menu' });
}

describe('RingsideMenu', () => {
  beforeEach(() => {
    mocks.auth.hasRole = () => false;
    mocks.auth.userWithRoles = null;
    mocks.auth.user = { id: 'u1', is_anonymous: false };
    mocks.auth.signOut.mockReset();
    mocks.online = true;
    mocks.canManage = false;
    useRingsideReturnStore.getState().clear();
    useNotificationStore.setState({ isCenterOpen: false });
    useAskQPanelStore.getState().close();
  });

  it('has a 48px menu button', () => {
    renderMenu();
    const button = screen.getByRole('button', { name: 'Ringside menu' });
    expect(button.className).toMatch(/\bh-12\b/);
    expect(button.className).toMatch(/\bw-12\b/);
  });

  it('lists the core items for a signed-in exhibitor, none of them staff-only', async () => {
    const { user } = renderMenu();
    const nav = await openMenu(user);
    const labels = within(nav)
      .getAllByRole('button')
      .map(button => button.textContent);
    expect(labels).toEqual([
      'Announcements',
      'Settings',
      'Results',
      'Show info',
      'Ask for help (AskQ)',
      'Sign out',
    ]);
  });

  it('opens Settings on Appearance and records the ringside screen to return to', async () => {
    const { user } = renderMenu('/at-show/show-1/class/class-1?tab=a');
    const nav = await openMenu(user);
    await user.click(within(nav).getByRole('button', { name: 'Settings' }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/account?section=appearance')
    );
    expect(useRingsideReturnStore.getState().target).toMatchObject({
      returnTo: '/at-show/show-1/class/class-1?tab=a',
      scope: '/account',
    });
  });

  it('has no Stats item, and shows Results to a viewer who is not a manager', async () => {
    const { user } = renderMenu();
    const nav = await openMenu(user);
    expect(within(nav).queryByRole('button', { name: /^Stats/ })).not.toBeInTheDocument();
    await user.click(within(nav).getByRole('button', { name: 'Results' }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/shows/show-1?tab=results')
    );
  });

  it('sends a show manager to the results page', async () => {
    mocks.canManage = true;
    const { user } = renderMenu();
    const nav = await openMenu(user);
    await user.click(within(nav).getByRole('button', { name: 'Results' }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/shows/show-1/results')
    );
  });

  it('says Results needs a connection when offline, and does not navigate', async () => {
    mocks.online = false;
    const { user } = renderMenu();
    const nav = await openMenu(user);
    const results = within(nav).getByRole('button', { name: /^Results/ });
    expect(results).toHaveAttribute('aria-disabled', 'true');
    expect(results).toHaveTextContent('Needs a connection');
    await user.click(results);
    expect(screen.getByTestId('location')).toHaveTextContent('/at-show/show-1/class/class-1');
    expect(useRingsideReturnStore.getState().target).toBeNull();
  });

  it('keeps Settings usable offline and opens it', async () => {
    mocks.online = false;
    const { user } = renderMenu();
    const nav = await openMenu(user);
    const settings = within(nav).getByRole('button', { name: /^Settings/ });
    expect(settings).not.toHaveAttribute('aria-disabled');
    expect(settings).not.toHaveTextContent('Needs a connection');
    await user.click(settings);
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/account?section=appearance')
    );
  });

  it('keeps Announcements and Sign out usable offline', async () => {
    mocks.online = false;
    const { user } = renderMenu();
    const nav = await openMenu(user);
    for (const name of ['Announcements', 'Sign out']) {
      expect(within(nav).getByRole('button', { name })).not.toHaveAttribute('aria-disabled');
    }
  });

  it('omits Settings for a passcode session', async () => {
    mocks.auth.user = { id: 'anon', is_anonymous: true };
    const { user } = renderMenu();
    const nav = await openMenu(user);
    expect(within(nav).queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('shows contacts, a maps link and a weather link under Show info', async () => {
    const { user } = renderMenu();
    const nav = await openMenu(user);
    await user.click(within(nav).getByRole('button', { name: 'Show info' }));
    const info = await screen.findByTestId('ringside-show-info');
    expect(within(info).getByRole('link', { name: /Sam Secretary/ })).toHaveAttribute(
      'href',
      'mailto:sam@example.com'
    );
    expect(within(info).getByRole('link', { name: /Cher Chair/ })).toHaveAttribute(
      'href',
      'mailto:cher@example.com'
    );
    expect(within(info).getByRole('link', { name: /123 Main St/ })).toHaveAttribute(
      'href',
      expect.stringContaining('https://www.google.com/maps/search/')
    );
    expect(within(info).getByRole('link', { name: 'Weather' })).toHaveAttribute(
      'href',
      expect.stringContaining('weather%20123%20Main%20St')
    );
  });

  it('opens the Message Center over the screen without navigating', async () => {
    const { user } = renderMenu();
    const nav = await openMenu(user);
    await user.click(within(nav).getByRole('button', { name: /^Announcements/ }));
    await waitFor(() => expect(useNotificationStore.getState().isCenterOpen).toBe(true), {
      timeout: 2000,
    });
    expect(screen.getByTestId('location')).toHaveTextContent('/at-show/show-1/class/class-1');
  });

  it('mounts AskQ only when it is asked for, and opens it', async () => {
    const { user } = renderMenu();
    expect(screen.queryByTestId('askq-panel')).not.toBeInTheDocument();
    const nav = await openMenu(user);
    await user.click(within(nav).getByRole('button', { name: /^Ask for help/ }));
    await waitFor(() => expect(useAskQPanelStore.getState().isOpen).toBe(true), {
      timeout: 2000,
    });
    expect(screen.getByTestId('askq-panel')).toBeInTheDocument();
  });

  it('signs out an exhibitor straight away', async () => {
    const { user } = renderMenu();
    const nav = await openMenu(user);
    await user.click(within(nav).getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(mocks.auth.signOut).toHaveBeenCalledTimes(1), { timeout: 2000 });
  });

  it('warns before a staff sign-out instead of ending the session', async () => {
    mocks.auth.getUserRoles = () => ['judge'];
    const { user } = renderMenu();
    const nav = await openMenu(user);
    await user.click(within(nav).getByRole('button', { name: 'Sign out' }));
    expect(
      await screen.findByText('Sign out before a show?', {}, { timeout: 2000 })
    ).toBeInTheDocument();
    expect(mocks.auth.signOut).not.toHaveBeenCalled();
    mocks.auth.getUserRoles = () => [];
  });
});
