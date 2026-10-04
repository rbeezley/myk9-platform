import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, render } from '@/test/utils/testUtils';
import { useLocation } from 'react-router-dom';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';
import BrowsePeoplePage from '../BrowsePeoplePage';

const ada = {
  id: 'person-1',
  firstName: 'Ada',
  lastName: 'Handler',
  email: 'ada@example.com',
  roles: ['exhibitor'],
};

vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({ hasPermission: () => true, isLoading: false }),
}));

vi.mock('@/hooks/useBrowsePeopleData', () => ({
  useBrowsePeopleData: () => ({
    people: [ada],
    filteredPeople: [ada],
    isLoading: false,
    error: null,
    filters: { search: '', role: 'all', location: 'all', login: 'all' },
    setFilters: vi.fn(),
    hasActiveFilters: false,
    clearAllFilters: vi.fn(),
  }),
}));

vi.mock('@/store/userStore', () => ({ useUserStore: () => ({ addUser: vi.fn() }) }));

vi.mock('@/components/users/browse', () => ({
  PeopleCompactList: () => <div data-testid="people-compact">compact list</div>,
  PeopleGridView: () => <div data-testid="people-grid">grid</div>,
  PeopleTableView: ({ onOpenPerson }: { onOpenPerson?: (p: typeof ada) => void }) => (
    <button type="button" data-testid="people-table" onClick={() => onOpenPerson?.(ada)}>
      table
    </button>
  ),
  PeopleListToolbar: ({ resultLineExtra }: { resultLineExtra?: React.ReactNode }) => (
    <div>{resultLineExtra}</div>
  ),
  PeopleBulkBar: () => <div data-testid="people-bulk-bar">bulk bar</div>,
}));

vi.mock('@/components/panels/edit', () => ({ UserEditPanel: () => null }));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="current-location">{location.pathname}</div>;
}

const renderWide = () =>
  render(
    <>
      <BrowsePeoplePage detail={<p>detail pane</p>} />
      <LocationProbe />
    </>
  );

describe('BrowsePeoplePage select mode (wide, split)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockViewportWidth(1600);
  });

  it('starts split: compact list beside the detail pane, no table or bulk bar', () => {
    renderWide();
    expect(screen.getByTestId('people-compact')).toBeInTheDocument();
    expect(screen.getByText('detail pane')).toBeInTheDocument();
    expect(screen.queryByTestId('people-table')).not.toBeInTheDocument();
    expect(screen.queryByTestId('people-bulk-bar')).not.toBeInTheDocument();
  });

  it('"Select people" swaps the split for the full-width table and the bulk bar', async () => {
    renderWide();
    await userEvent.click(screen.getByRole('button', { name: 'Select people' }));
    expect(screen.getByTestId('people-table')).toBeInTheDocument();
    expect(screen.getByTestId('people-bulk-bar')).toBeInTheDocument();
    expect(screen.queryByText('detail pane')).not.toBeInTheDocument();
    expect(screen.queryByTestId('people-compact')).not.toBeInTheDocument();
  });

  it('"Done" returns to the split', async () => {
    renderWide();
    await userEvent.click(screen.getByRole('button', { name: 'Select people' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByTestId('people-compact')).toBeInTheDocument();
    expect(screen.getByText('detail pane')).toBeInTheDocument();
    expect(screen.queryByTestId('people-bulk-bar')).not.toBeInTheDocument();
  });

  it('opening a person from the table ends select mode and goes to that person', async () => {
    renderWide();
    await userEvent.click(screen.getByRole('button', { name: 'Select people' }));
    await userEvent.click(screen.getByTestId('people-table'));
    expect(screen.getByTestId('current-location')).toHaveTextContent('/people/person-1');
    expect(screen.getByTestId('people-compact')).toBeInTheDocument();
  });

  it('offers no select mode on a narrow screen, where the table is always the list', () => {
    mockViewportWidth(1000);
    render(<BrowsePeoplePage />);
    expect(screen.queryByRole('button', { name: 'Select people' })).not.toBeInTheDocument();
    expect(screen.getByTestId('people-table')).toBeInTheDocument();
  });
});
