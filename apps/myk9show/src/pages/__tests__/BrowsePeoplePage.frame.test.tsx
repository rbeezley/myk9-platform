import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, render, within } from '@/test/utils/testUtils';
import BrowsePeoplePage from '../BrowsePeoplePage';

// MYK9-929 (H7, M7, M9): People sits in the same page frame as Clubs and Dogs, says the one
// empty-state wording, shows its error with a Retry, opens on the table (staff list, decision 8),
// and carries the labelled view toggle in the result line.

const person = {
  id: 'person-1',
  firstName: 'Ada',
  lastName: 'Handler',
  email: 'ada@example.com',
  roles: ['exhibitor'],
};

const clearAllFilters = vi.fn();
const handleRetry = vi.fn();
let data = baseData();

function baseData() {
  return {
    people: [person],
    filteredPeople: [person],
    isLoading: false,
    error: null as Error | null,
    filters: { search: '', role: 'all', location: 'all', login: 'all' },
    setFilters: vi.fn(),
    hasActiveFilters: false,
    clearAllFilters,
    handleRetry,
  };
}

vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({ hasPermission: () => true, isLoading: false }),
}));
vi.mock('@/hooks/useBrowsePeopleData', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useBrowsePeopleData')>()),
  useBrowsePeopleData: () => data,
}));
vi.mock('@/store/userStore', () => ({ useUserStore: () => ({ addUser: vi.fn() }) }));
vi.mock('@/components/users/browse', async importOriginal => ({
  ...(await importOriginal<typeof import('@/components/users/browse')>()),
  PeopleGridView: () => <div data-testid="people-grid" />,
  PeopleTableView: () => <div data-testid="people-table" />,
  PeopleBulkBar: () => null,
}));
vi.mock('@/components/panels/edit', () => ({ UserEditPanel: () => null }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

describe('BrowsePeoplePage list frame', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAllFilters.mockReset();
    handleRetry.mockReset();
    data = baseData();
  });

  it('sits in the shared page frame, with the PageHeader breadcrumb and title', () => {
    render(<BrowsePeoplePage />);

    expect(screen.getByTestId('app-shell-page')).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(within(crumbs).getByText('People')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'People' })).toBeInTheDocument();
  });

  it('opens a staff roster on the table, with the labelled toggle in the result line', async () => {
    const { user } = render(<BrowsePeoplePage />);

    expect(screen.getByTestId('people-table')).toBeInTheDocument();
    const resultLine = screen.getByRole('status').parentElement as HTMLElement;
    expect(resultLine).toHaveTextContent('Showing all 1 person.');
    expect(within(resultLine).getByText('Cards')).toBeInTheDocument();
    await user.click(within(resultLine).getByRole('button', { name: 'Cards view' }));
    expect(screen.getByTestId('people-grid')).toBeInTheDocument();
    expect(localStorage.getItem('view-pref-people')).toBe('cards');
  });

  it('says "No people yet" with the shared empty state', () => {
    data = { ...baseData(), people: [], filteredPeople: [] };
    render(<BrowsePeoplePage />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No people yet' })).toBeInTheDocument();
    expect(
      within(screen.getByTestId('empty-state')).getByRole('button', { name: 'Add Person' })
    ).toBeInTheDocument();
  });

  it('says the one filtered wording and resets with "Show all people"', async () => {
    data = { ...baseData(), filteredPeople: [], hasActiveFilters: true };
    const { user } = render(<BrowsePeoplePage />);

    expect(
      screen.getByRole('heading', { name: 'No people match your search or filters.' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Show all people' })[0]!);
    expect(clearAllFilters).toHaveBeenCalled();
  });

  it('offers Try Again when the roster fails to load', async () => {
    data = { ...baseData(), people: [], filteredPeople: [], error: new Error('boom') };
    const { user } = render(<BrowsePeoplePage />);

    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load people.");
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(handleRetry).toHaveBeenCalledOnce();
  });

  it('keeps the cached rows and offers Try again when a background refresh fails', async () => {
    data = { ...baseData(), error: new Error('refresh failed') };
    const { user } = render(<BrowsePeoplePage />);

    // The roster is still on screen...
    expect(screen.getByTestId('people-table')).toBeInTheDocument();
    // ...with a visible, inline way to retry rather than a full-page error.
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent(/couldn't refresh/i);
    await user.click(within(banner).getByRole('button', { name: 'Try again' }));
    expect(handleRetry).toHaveBeenCalledOnce();
  });
});
