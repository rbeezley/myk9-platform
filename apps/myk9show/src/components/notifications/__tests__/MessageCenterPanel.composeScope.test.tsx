/**
 * MYK9-641 (secretary task walk F47): the Message Center composer must offer only
 * the shows this person can message for, and must inherit the show the secretary
 * is standing on. The fixtures model the walk: a Heartland-only secretary whose
 * show store also holds another club's show (loaded for public browsing) and
 * whose announcement subscription carries a show they are exhibiting at.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { MessageCenterPanel } from '../MessageCenterPanel';
import { useNotificationStore } from '@/store/notificationStore';
import { useAnnouncementStore as realAnnouncementStore } from '@/store/announcementStore';
import { useShowStore as realShowStore } from '@/store/showStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('@/store/announcementStore', async () => {
  const { create } = await import('zustand');
  return {
    useAnnouncementStore: create<Record<string, unknown>>()(() => ({
      announcements: [],
      unreadCount: 0,
      currentShowIds: [],
      markRead: vi.fn(),
      markAllRead: vi.fn(),
    })),
  };
});

vi.mock('@/store/messageStore', async () => {
  const { create } = await import('zustand');
  return {
    useMessageStore: create<Record<string, unknown>>()(() => ({
      threads: [],
      unreadCount: 0,
      isLoading: false,
      error: null,
      currentShowIds: [],
      subscribe: vi.fn(),
      markThreadRead: vi.fn(),
    })),
  };
});

vi.mock('@/store/showStore', async () => {
  const { create } = await import('zustand');
  return { useShowStore: create<Record<string, unknown>>()(() => ({ shows: [] })) };
});

vi.mock('@/features/show-workbench/MessageShowComposer', () => ({
  MessageShowComposer: ({ showId }: { showId: string }) => (
    <div data-testid="message-show-composer">Composer for {showId}</div>
  ),
}));

vi.mock('@/features/messages/hooks/useMessageShowClassOptions', () => ({
  useMessageShowClassOptions: () => ({ data: [] }),
}));

// Both stores are mocked above with loose shapes; only the fields read here matter.
type LooseStore = { setState: (state: Record<string, unknown>) => void };
const useAnnouncementStore = realAnnouncementStore as unknown as LooseStore;
const useShowStore = realShowStore as unknown as LooseStore;

const HEARTLAND = 'club-heartland';
const OTHER_CLUB = 'club-blue-sky';

let authContext: Record<string, unknown> = {};

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => authContext,
}));

function heartlandSecretary(extraRoles: string[] = []) {
  const roles = ['secretary', ...extraRoles];
  return {
    user: { id: 'secretary-1', email: 'secretary@test.com' },
    userWithRoles: {
      id: 'secretary-1',
      roles,
      scopes: [{ scopeType: 'club', scopeId: HEARTLAND, roleId: 'secretary' }],
      user_metadata: {},
    },
    isSecretary: true,
    isAdmin: false,
    hasRole: (role: string) => roles.includes(role),
  };
}

function openCompose(route: string) {
  render(<MessageCenterPanel />, { initialRoute: route });
  fireEvent.click(screen.getByRole('button', { name: /compose/i }));
  return screen.getByRole('dialog', { name: /compose show message/i });
}

beforeEach(() => {
  authContext = heartlandSecretary();
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    recentAlerts: [],
    unreadCount: 0,
    isCenterOpen: true,
  });
  useAnnouncementStore.setState({ currentShowIds: [] });
  useShowStore.setState({
    shows: [
      { id: 'heartland-classic', name: 'Heartland Scent Work Classic', clubId: HEARTLAND },
      { id: 'heartland-ukc', name: 'Heartland UKC Nosework Trial', clubId: HEARTLAND },
      { id: 'blue-sky-weekend', name: 'Blue Sky Scent Work Weekend', clubId: OTHER_CLUB },
      { id: 'club-less-probe', name: 'ZZ Audit - Publish Path Probe', clubId: undefined },
    ],
  });
});

describe('MessageCenterPanel compose show scope (MYK9-641)', () => {
  it("inherits the show from the show page's own path", () => {
    const dialog = openCompose('/shows/heartland-ukc');

    expect(within(dialog).getByTestId('message-show-composer')).toHaveTextContent(
      'Composer for heartland-ukc'
    );
    expect(within(dialog).queryByText(/select a show to continue/i)).not.toBeInTheDocument();
  });

  it('inherits the show from a nested show route', () => {
    const dialog = openCompose('/shows/heartland-classic/show-desk');

    expect(within(dialog).getByTestId('message-show-composer')).toHaveTextContent(
      'Composer for heartland-classic'
    );
  });

  it("does not inherit a show from another club's page", () => {
    const dialog = openCompose('/shows/blue-sky-weekend');

    expect(within(dialog).queryByTestId('message-show-composer')).not.toBeInTheDocument();
    expect(within(dialog).getByText(/select a show to continue/i)).toBeInTheDocument();
  });

  it("offers only the secretary's own club's shows, not every loaded show", () => {
    const dialog = openCompose('/secretary/dashboard');
    fireEvent.click(within(dialog).getByRole('combobox'));

    const options = screen.getAllByRole('option').map(option => option.textContent);
    expect(options).toEqual(['Heartland Scent Work Classic', 'Heartland UKC Nosework Trial']);
  });

  it('does not offer a show the secretary is only exhibiting at', () => {
    useAnnouncementStore.setState({ currentShowIds: ['blue-sky-weekend'] });

    const dialog = openCompose('/secretary/dashboard');
    fireEvent.click(within(dialog).getByRole('combobox'));

    expect(screen.queryByRole('option', { name: /blue sky/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('keeps an assigned judge able to post to the show they are working', () => {
    authContext = {
      user: { id: 'judge-1', email: 'judge@test.com' },
      userWithRoles: { id: 'judge-1', roles: ['judge'], scopes: [], user_metadata: {} },
      isSecretary: false,
      isAdmin: false,
      hasRole: (role: string) => role === 'judge',
    };
    useAnnouncementStore.setState({ currentShowIds: ['blue-sky-weekend'] });

    const dialog = openCompose('/');

    expect(within(dialog).getByTestId('message-show-composer')).toHaveTextContent(
      'Composer for blue-sky-weekend'
    );
  });

  // MYK9-641 scopes secretaries, club admins and site admins only. A judge keeps
  // exactly the pre-641 list (the subscription, else the show store), so a
  // judge assigned to a future show that is only in the store can still reach it.
  it('gives a judge the same show list as before, including a future assigned show', () => {
    authContext = {
      user: { id: 'judge-1', email: 'judge@test.com' },
      userWithRoles: { id: 'judge-1', roles: ['judge'], scopes: [], user_metadata: {} },
      isSecretary: false,
      isAdmin: false,
      hasRole: (role: string) => role === 'judge',
    };

    const dialog = openCompose('/judge/dashboard');
    fireEvent.click(within(dialog).getByRole('combobox'));

    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual([
      'Heartland Scent Work Classic',
      'Heartland UKC Nosework Trial',
      'Blue Sky Scent Work Weekend',
      'ZZ Audit - Publish Path Probe',
    ]);
  });

  it("opens a judge's composer on the show page they are on", () => {
    authContext = {
      user: { id: 'judge-1', email: 'judge@test.com' },
      userWithRoles: { id: 'judge-1', roles: ['judge'], scopes: [], user_metadata: {} },
      isSecretary: false,
      isAdmin: false,
      hasRole: (role: string) => role === 'judge',
    };

    const dialog = openCompose('/shows/blue-sky-weekend');

    expect(within(dialog).getByTestId('message-show-composer')).toHaveTextContent(
      'Composer for blue-sky-weekend'
    );
  });

  it('lets a site admin pick any show', () => {
    authContext = {
      user: { id: 'admin-1', email: 'admin@test.com' },
      userWithRoles: { id: 'admin-1', roles: ['site_admin'], scopes: [], user_metadata: {} },
      isSecretary: false,
      isAdmin: true,
      hasRole: (role: string) => role === 'site_admin',
    };

    const dialog = openCompose('/shows/blue-sky-weekend');

    expect(within(dialog).getByTestId('message-show-composer')).toHaveTextContent(
      'Composer for blue-sky-weekend'
    );
  });
});
