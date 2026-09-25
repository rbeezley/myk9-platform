/**
 * MYK9-641 / MYK9-722: the Message Center composer offers only the shows this
 * person may post to, one rule per role, and inherits the show it was opened
 * from.
 *
 * - Secretary / club admin: their own club's shows (the `show_messages` and
 *   `show_announcements` club arm). Site admin: any show.
 * - Judge: the shows they hold a confirmed or invited assignment at (the
 *   `show_announcements` judge arm), read from the replicated assignments so a
 *   future show that is not in the show store, or an offline device, still
 *   lists it.
 * - Neither role falls back to the announcement subscription or the raw show
 *   store, which also hold shows the person only exhibits at or browsed.
 *
 * The fixtures model the 2026-09-17 walk (F47): a Heartland-only secretary whose
 * show store also holds another club's show and a club-less probe.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, fireEvent, within, waitFor } from '@testing-library/react';
import { render, userEvent } from '@/test/utils/testUtils';
import { MessageCenterPanel } from '../MessageCenterPanel';
import { useNotificationStore } from '@/store/notificationStore';
import { useAnnouncementStore as realAnnouncementStore } from '@/store/announcementStore';
import { useShowStore as realShowStore } from '@/store/showStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';

const judgeReads = vi.hoisted(() => ({
  getActiveJudgeAssignmentShows: vi.fn(),
  subscribeToJudgeAssignmentChanges: vi.fn(() => () => {}),
}));

let judgeTableStatus: 'idle' | 'syncing' | 'success' | 'error' = 'success';

vi.mock('@/services/database/judges', () => judgeReads);

vi.mock('@/hooks/useReplicationSync', () => ({
  useReplicationSync: () => ({
    status: { tablesStatus: { judge_assignments: judgeTableStatus } },
    syncTable: vi.fn(),
  }),
}));

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
  return {
    useShowStore: create<Record<string, unknown>>()(() => ({ shows: [], isLoading: false })),
  };
});

vi.mock('@/features/show-workbench/MessageShowComposer', async () => {
  const { useState } = await import('react');
  return {
    MessageShowComposer: ({
      showId,
      allowedRecipients,
      showWideDeliveryLane,
    }: {
      showId: string;
      allowedRecipients?: string[];
      showWideDeliveryLane?: string;
    }) => {
      // The real composer keeps its recipient choice in local state, so a stale
      // instance carries a lane the next show does not allow (Codex, PR #2443).
      const [mountedFor] = useState(showId);
      return (
        <div
          data-testid="message-show-composer"
          data-mounted-for={mountedFor}
          data-allowed-recipients={allowedRecipients?.join(',') ?? ''}
          data-show-wide-lane={showWideDeliveryLane ?? ''}
        >
          Composer for {showId}
        </div>
      );
    },
  };
});

const classOptions = vi.hoisted(() => ({
  hook: vi.fn(
    (
      _showId?: string | null,
      _options?: { enabled?: boolean }
    ): { data: unknown[] | undefined; isError?: boolean; refetch?: () => void } => ({ data: [] })
  ),
}));

vi.mock('@/features/messages/hooks/useMessageShowClassOptions', () => ({
  useMessageShowClassOptions: (showId: string | null, options: { enabled?: boolean }) =>
    classOptions.hook(showId, options),
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

function staff(roles: string[], scopes: Array<Record<string, string>>, databaseUserId?: string) {
  return {
    user: { id: 'user-1', email: 'user@test.com', is_anonymous: false },
    userWithRoles: { id: 'user-1', roles, scopes, user_metadata: {}, databaseUserId },
    isSecretary: roles.includes('secretary'),
    isAdmin: roles.includes('site_admin'),
    hasRole: (role: string) => roles.includes(role),
  };
}

const heartlandSecretary = () =>
  staff(['secretary'], [{ scopeType: 'club', scopeId: HEARTLAND, roleId: 'secretary' }]);
const heartlandClubAdmin = () =>
  staff(['club_admin'], [{ scopeType: 'club', scopeId: HEARTLAND, roleId: 'club_admin' }]);
const judge = () => staff(['judge'], [], 'person-judge');

function openCompose(route: string) {
  render(<MessageCenterPanel />, { initialRoute: route });
  fireEvent.click(screen.getByRole('button', { name: /compose/i }));
  return screen.getByRole('dialog', { name: /compose show message/i });
}

function offeredShowNames(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole('combobox'));
  return screen.getAllByRole('option').map(option => option.textContent);
}

beforeEach(() => {
  classOptions.hook.mockReset();
  classOptions.hook.mockReturnValue({ data: [] });
  authContext = heartlandSecretary();
  judgeTableStatus = 'success';
  judgeReads.getActiveJudgeAssignmentShows.mockReset();
  judgeReads.getActiveJudgeAssignmentShows.mockResolvedValue([]);
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    recentAlerts: [],
    unreadCount: 0,
    isCenterOpen: true,
  });
  useAnnouncementStore.setState({ currentShowIds: [] });
  useShowStore.setState({
    isLoading: false,
    shows: [
      { id: 'heartland-classic', name: 'Heartland Scent Work Classic', clubId: HEARTLAND },
      { id: 'heartland-ukc', name: 'Heartland UKC Nosework Trial', clubId: HEARTLAND },
      { id: 'blue-sky-weekend', name: 'Blue Sky Scent Work Weekend', clubId: OTHER_CLUB },
      { id: 'club-less-probe', name: 'ZZ Audit - Publish Path Probe', clubId: undefined },
    ],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('secretary and club admin: the shows their club runs (MYK9-641)', () => {
  it('opens on the show page it was opened from, locked to that show', () => {
    const dialog = openCompose('/shows/heartland-ukc');

    expect(within(dialog).getByTestId('message-show-composer')).toHaveTextContent(
      'Composer for heartland-ukc'
    );
    expect(within(dialog).getByText('Heartland UKC Nosework Trial')).toBeInTheDocument();
    expect(within(dialog).queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('inherits the show from a nested secretary route', () => {
    const dialog = openCompose('/secretary/shows/heartland-classic/edit');

    expect(within(dialog).getByTestId('message-show-composer')).toHaveTextContent(
      'Composer for heartland-classic'
    );
  });

  it("does not inherit another club's show page; it offers the picker instead", () => {
    const dialog = openCompose('/shows/blue-sky-weekend');

    expect(within(dialog).queryByTestId('message-show-composer')).not.toBeInTheDocument();
    expect(offeredShowNames(dialog)).toEqual([
      'Heartland Scent Work Classic',
      'Heartland UKC Nosework Trial',
    ]);
  });

  it("offers only the club's own shows, never another club's or a club-less one", () => {
    const dialog = openCompose('/secretary/dashboard');

    expect(offeredShowNames(dialog)).toEqual([
      'Heartland Scent Work Classic',
      'Heartland UKC Nosework Trial',
    ]);
  });

  it('does not offer a show the secretary is only subscribed to as an exhibitor', () => {
    useAnnouncementStore.setState({ currentShowIds: ['blue-sky-weekend'] });

    const dialog = openCompose('/secretary/dashboard');

    expect(offeredShowNames(dialog)).not.toContain('Blue Sky Scent Work Weekend');
  });

  it('scopes a club admin to their own club too', () => {
    authContext = heartlandClubAdmin();

    const dialog = openCompose('/secretary/dashboard');

    expect(offeredShowNames(dialog)).toEqual([
      'Heartland Scent Work Classic',
      'Heartland UKC Nosework Trial',
    ]);
  });

  it('says it is loading, not that there are no shows, while the show list hydrates', () => {
    useShowStore.setState({ shows: [], isLoading: true });

    const dialog = openCompose('/shows/heartland-ukc');

    expect(within(dialog).getByText(/loading your shows/i)).toBeInTheDocument();
    expect(within(dialog).queryByTestId('message-show-composer')).not.toBeInTheDocument();
  });

  it('lets a site admin post to any show', () => {
    authContext = staff(['site_admin'], []);

    const dialog = openCompose('/shows/blue-sky-weekend');

    expect(within(dialog).getByTestId('message-show-composer')).toHaveTextContent(
      'Composer for blue-sky-weekend'
    );
  });
});

describe('judge: the shows they are assigned to judge (MYK9-722)', () => {
  it('offers assigned shows only, not a show they exhibit at', async () => {
    authContext = judge();
    useAnnouncementStore.setState({ currentShowIds: ['blue-sky-weekend'] });
    judgeReads.getActiveJudgeAssignmentShows.mockResolvedValue([
      { showId: 'heartland-classic', firstTrialDate: '2026-10-10' },
      { showId: 'heartland-ukc', firstTrialDate: '2026-11-07' },
    ]);

    const dialog = openCompose('/judge/dashboard');

    await waitFor(() => expect(within(dialog).getByRole('combobox')).toBeInTheDocument());
    expect(judgeReads.getActiveJudgeAssignmentShows).toHaveBeenCalledWith('person-judge');
    expect(offeredShowNames(dialog)).toEqual([
      'Heartland Scent Work Classic',
      'Heartland UKC Nosework Trial',
    ]);
  });

  it('lists a future assignment that is not in the show store, while offline', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    authContext = judge();
    judgeReads.getActiveJudgeAssignmentShows.mockResolvedValue([
      { showId: 'heartland-classic', firstTrialDate: '2026-10-10' },
      { showId: 'future-show', firstTrialDate: '2027-03-06' },
    ]);

    const dialog = openCompose('/judge/dashboard');

    await waitFor(() => expect(within(dialog).getByRole('combobox')).toBeInTheDocument());
    const names = offeredShowNames(dialog);
    expect(names).toHaveLength(2);
    expect(names[0]).toBe('Heartland Scent Work Classic');
    expect(names[1]).toMatch(/Mar 6, 2027/);
  });

  it('opens on the assigned show page it came from, locked, show-wide only', async () => {
    authContext = judge();
    judgeReads.getActiveJudgeAssignmentShows.mockResolvedValue([
      { showId: 'heartland-classic', firstTrialDate: '2026-10-10' },
      { showId: 'heartland-ukc', firstTrialDate: '2026-11-07' },
    ]);

    const dialog = openCompose('/at-show/heartland-ukc');

    const composer = await within(dialog).findByTestId('message-show-composer');
    expect(composer).toHaveTextContent('Composer for heartland-ukc');
    expect(composer).toHaveAttribute('data-allowed-recipients', 'all_show');
    expect(composer).toHaveAttribute('data-show-wide-lane', 'announcement');
    expect(within(dialog).queryByRole('combobox')).not.toBeInTheDocument();
  });

  // Codex, PR #2443 round 2: a judge only posts show-wide, which needs no classes,
  // so a failed class read must not stand between them and the announcement.
  it('never looks up classes for a judge, so a class-read failure cannot block them', async () => {
    authContext = judge();
    classOptions.hook.mockReturnValue({ data: undefined, isError: true, refetch: vi.fn() });
    judgeReads.getActiveJudgeAssignmentShows.mockResolvedValue([
      { showId: 'heartland-ukc', firstTrialDate: '2026-11-07' },
    ]);

    const dialog = openCompose('/at-show/heartland-ukc');

    const composer = await within(dialog).findByTestId('message-show-composer');
    expect(composer).toHaveTextContent('Composer for heartland-ukc');
    expect(within(dialog).queryByText(/couldn't load classes/i)).not.toBeInTheDocument();
    expect(classOptions.hook).not.toHaveBeenCalledWith('heartland-ukc', expect.anything());
  });

  it("does not open on a show page the judge isn't assigned to", async () => {
    authContext = judge();
    judgeReads.getActiveJudgeAssignmentShows.mockResolvedValue([
      { showId: 'heartland-classic', firstTrialDate: '2026-10-10' },
    ]);

    const dialog = openCompose('/shows/blue-sky-weekend');

    // The only assigned show is offered, never the page the judge is browsing.
    const composer = await within(dialog).findByTestId('message-show-composer');
    expect(composer).toHaveTextContent('Composer for heartland-classic');
  });

  it('says it is loading, not that there are no shows, while identity is unresolved', () => {
    // Offline cold boot: roles come from the permissions cache, the person row does not.
    authContext = staff(['judge'], [], undefined);

    const dialog = openCompose('/judge/dashboard');

    expect(within(dialog).getByText(/loading the shows you're judging/i)).toBeInTheDocument();
    expect(within(dialog).queryByText(/no shows/i)).not.toBeInTheDocument();
    expect(judgeReads.getActiveJudgeAssignmentShows).not.toHaveBeenCalled();
  });

  it('says it is loading while the first assignment sync is still in flight', async () => {
    authContext = judge();
    judgeTableStatus = 'syncing';

    const dialog = openCompose('/judge/dashboard');

    await waitFor(() => expect(judgeReads.getActiveJudgeAssignmentShows).toHaveBeenCalled());
    expect(within(dialog).getByText(/loading the shows you're judging/i)).toBeInTheDocument();
  });

  it('says when a judge truly has no assignments to post to', async () => {
    authContext = judge();

    const dialog = openCompose('/judge/dashboard');

    expect(await within(dialog).findByText(/no shows you can post to/i)).toBeInTheDocument();
  });
});

describe('secretary who also judges', () => {
  it('keeps targeted lanes on their own show and show-wide only on a show they judge', async () => {
    authContext = staff(
      ['secretary', 'judge'],
      [{ scopeType: 'club', scopeId: HEARTLAND, roleId: 'secretary' }],
      'person-judge'
    );
    judgeReads.getActiveJudgeAssignmentShows.mockResolvedValue([
      { showId: 'blue-sky-weekend', firstTrialDate: '2026-10-10' },
    ]);

    const judged = openCompose('/shows/blue-sky-weekend');
    const judgedComposer = await within(judged).findByTestId('message-show-composer');
    expect(judgedComposer).toHaveTextContent('Composer for blue-sky-weekend');
    expect(judgedComposer).toHaveAttribute('data-allowed-recipients', 'all_show');
    expect(judgedComposer).toHaveAttribute('data-show-wide-lane', 'announcement');
  });

  it('starts a fresh composer when switching from a managed show to a judged one', async () => {
    authContext = staff(
      ['secretary', 'judge'],
      [{ scopeType: 'club', scopeId: HEARTLAND, roleId: 'secretary' }],
      'person-judge'
    );
    judgeReads.getActiveJudgeAssignmentShows.mockResolvedValue([
      { showId: 'blue-sky-weekend', firstTrialDate: '2026-10-10' },
    ]);

    const user = userEvent.setup();
    const dialog = openCompose('/secretary/dashboard');
    await user.click(await within(dialog).findByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Heartland Scent Work Classic' }));
    const managed = await within(dialog).findByTestId('message-show-composer');
    expect(managed).toHaveAttribute('data-allowed-recipients', 'all_show,class,checked_in');

    await user.click(within(dialog).getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Blue Sky Scent Work Weekend' }));

    await waitFor(() =>
      expect(within(dialog).getByTestId('message-show-composer')).toHaveTextContent(
        'Composer for blue-sky-weekend'
      )
    );
    const judged = within(dialog).getByTestId('message-show-composer');
    expect(judged).toHaveAttribute('data-mounted-for', 'blue-sky-weekend');
    expect(judged).toHaveAttribute('data-allowed-recipients', 'all_show');
  });

  // Codex, PR #2443 round 2: an unsynced judge list must not hold back the shows
  // the secretary already manages (offline cold start).
  it('offers managed shows at once while the judged list is still loading', () => {
    authContext = staff(
      ['secretary', 'judge'],
      [{ scopeType: 'club', scopeId: HEARTLAND, roleId: 'secretary' }],
      'person-judge'
    );
    judgeTableStatus = 'syncing';

    const dialog = openCompose('/secretary/dashboard');

    expect(within(dialog).getByText(/still loading the shows you're judging/i)).toBeInTheDocument();
    expect(offeredShowNames(dialog)).toEqual([
      'Heartland Scent Work Classic',
      'Heartland UKC Nosework Trial',
    ]);
  });

  it('offers the union of managed and judged shows', async () => {
    authContext = staff(
      ['secretary', 'judge'],
      [{ scopeType: 'club', scopeId: HEARTLAND, roleId: 'secretary' }],
      'person-judge'
    );
    judgeReads.getActiveJudgeAssignmentShows.mockResolvedValue([
      { showId: 'blue-sky-weekend', firstTrialDate: '2026-10-10' },
    ]);

    const dialog = openCompose('/secretary/dashboard');
    fireEvent.click(await within(dialog).findByRole('combobox'));

    await waitFor(() =>
      expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual([
        'Heartland Scent Work Classic',
        'Heartland UKC Nosework Trial',
        'Blue Sky Scent Work Weekend',
      ])
    );
  });
});
