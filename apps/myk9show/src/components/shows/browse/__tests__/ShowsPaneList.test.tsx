import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { showFactory } from '@/test/utils/factories';
import type { Show } from '@/types/show-types';
import { ScopeType } from '@/types/auth-types';
import { ShowsPaneList } from '../ShowsPaneList';

interface DataState {
  shows: Show[];
  isLoading: boolean;
  showsError: Error | null;
}

const data: DataState = { shows: [], isLoading: false, showsError: null };
const handleRetry = vi.fn().mockResolvedValue(undefined);
const auth = {
  userWithRoles: null as unknown,
  isAdmin: false,
  isSecretary: false,
};

vi.mock('@/hooks/useBrowseShowsList', () => ({
  useBrowseShowsList: () => ({
    shows: data.shows,
    isLoading: data.isLoading,
    showsError: data.showsError,
    retryShows: handleRetry,
  }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => auth,
}));

const secretaryOf = (clubId: string) => ({
  id: 'user-1',
  roles: ['secretary'],
  scopes: [{ scopeType: ScopeType.CLUB, scopeId: clubId, roleId: 'secretary' }],
});

const show = (overrides: Partial<Show>) =>
  showFactory.build({ status: 'published', entryWindowTimeZone: 'America/Chicago', ...overrides });

const renderList = (selectedId?: string) =>
  render(
    <MemoryRouter>
      <ShowsPaneList selectedId={selectedId} />
    </MemoryRouter>
  );

const rowNames = (list: HTMLElement) =>
  within(list)
    .getAllByRole('link')
    .map(link => link.querySelector('span')?.textContent);

describe('ShowsPaneList', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T16:00:00Z'));
    data.shows = [];
    data.isLoading = false;
    data.showsError = null;
    auth.userWithRoles = secretaryOf('club-mine');
    auth.isAdmin = false;
    auth.isSecretary = true;
    handleRetry.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('groups shows Today, Upcoming and Past with the viewer’s own shows first', () => {
    data.shows = [
      show({
        id: 'a',
        name: 'Other Today',
        clubId: 'club-x',
        startDate: '2026-10-14',
        endDate: '2026-10-16',
      }),
      show({
        id: 'b',
        name: 'My Today',
        clubId: 'club-mine',
        startDate: '2026-10-15',
        endDate: '2026-10-15',
      }),
      show({
        id: 'c',
        name: 'Other Soon',
        clubId: 'club-x',
        startDate: '2026-10-20',
        endDate: '2026-10-20',
      }),
      show({
        id: 'd',
        name: 'My Spring',
        clubId: 'club-mine',
        startDate: '2026-04-01',
        endDate: '2026-04-02',
      }),
    ];
    renderList('d');

    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([
      'Today',
      'Upcoming',
      'Past',
    ]);
    expect(rowNames(screen.getByRole('list', { name: 'Today shows' }))).toEqual([
      'My Today',
      'Other Today',
    ]);
    const past = screen.getByRole('list', { name: 'Past shows' });
    const pastRow = within(past).getByRole('link', { name: /My Spring/ });
    expect(pastRow).toHaveAttribute('href', '/shows/d');
    expect(pastRow).toHaveAttribute('aria-current', 'page');
    expect(pastRow).toHaveTextContent('Managing');
    expect(screen.getByRole('link', { name: /Other Soon/ })).not.toHaveTextContent('Managing');
  });

  it('shows skeleton rows while the first load is in flight', () => {
    data.isLoading = true;
    renderList();
    expect(screen.getByLabelText('Loading shows')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('reports a failed load inline with a Retry that re-reads', async () => {
    const user = userEvent.setup();
    data.showsError = new Error('replica read failed');
    renderList();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load your shows.");
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps listing the shows it already has when a refresh fails (offline)', () => {
    data.showsError = new Error('offline');
    data.shows = [
      show({ id: 'a', name: 'Cached Show', startDate: '2026-10-15', endDate: '2026-10-15' }),
    ];
    renderList();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cached Show/ })).toHaveAttribute('href', '/shows/a');
  });

  it('points a secretary with no shows to Show Management', () => {
    renderList();
    expect(screen.getByText('No shows yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Show Management' })).toHaveAttribute(
      'href',
      '/secretary/dashboard'
    );
  });

  it('offers an exhibitor with no shows no management link', () => {
    auth.userWithRoles = { id: 'user-2', roles: ['exhibitor'], scopes: [] };
    auth.isSecretary = false;
    renderList();
    expect(screen.getByText('No shows yet.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Go to Show Management' })).not.toBeInTheDocument();
  });

  it('says when a search matches nothing and offers every show back', async () => {
    const user = userEvent.setup();
    data.shows = [
      show({ id: 'a', name: 'Heartland Week', startDate: '2026-10-15', endDate: '2026-10-15' }),
    ];
    renderList();

    await user.type(screen.getByRole('textbox', { name: 'Search the shows list' }), 'zz');
    expect(screen.getByText('No shows match “zz”.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show all shows' }));
    expect(screen.getByRole('link', { name: /Heartland Week/ })).toBeInTheDocument();
  });

  it('tags a draft show so it is not mistaken for a published one', () => {
    data.shows = [
      show({
        id: 'a',
        name: 'Setup Show',
        status: 'draft',
        clubId: 'club-mine',
        startDate: '2026-11-20',
        endDate: '2026-11-20',
      }),
    ];
    renderList();
    const row = within(screen.getByRole('list', { name: 'Upcoming shows' })).getByRole('link');
    expect(row).toHaveTextContent('Managing · Draft · Nov 20, 2026');
  });

  it('pins nothing for a site admin, who manages every show', () => {
    auth.userWithRoles = { id: 'admin', roles: ['site_admin'], scopes: [] };
    auth.isAdmin = true;
    data.shows = [
      show({
        id: 'a',
        name: 'Any Show',
        clubId: 'club-x',
        startDate: '2026-10-15',
        endDate: '2026-10-15',
      }),
    ];
    renderList();
    expect(screen.getByRole('link', { name: /Any Show/ })).not.toHaveTextContent('Managing');
  });
});
