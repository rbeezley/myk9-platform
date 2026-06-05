import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, render } from '@/test/utils/testUtils';
import { useLocation } from 'react-router-dom';
import BrowsePeoplePage from '../BrowsePeoplePage';

const mockAddUser = vi.fn();

let mockBrowsePeopleReturn = {
  people: [
    {
      id: 'person-1',
      firstName: 'Ada',
      lastName: 'Handler',
      email: 'ada@example.com',
      roles: ['exhibitor'],
    },
  ],
  filteredPeople: [
    {
      id: 'person-1',
      firstName: 'Ada',
      lastName: 'Handler',
      email: 'ada@example.com',
      roles: ['exhibitor'],
    },
  ],
  isLoading: false,
  error: null,
  filters: { search: '', role: 'all' },
  setFilters: vi.fn(),
  hasActiveFilters: false,
  clearAllFilters: vi.fn(),
  availableRoles: ['exhibitor'],
};

vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({
    hasPermission: () => true,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useBrowsePeopleData', () => ({
  useBrowsePeopleData: () => mockBrowsePeopleReturn,
}));

vi.mock('@/store/userStore', () => ({
  useUserStore: () => ({
    addUser: mockAddUser,
  }),
}));

vi.mock('@/components/users/browse', () => ({
  PeopleGridView: () => <div data-testid="people-grid">People grid</div>,
  PeopleTableView: () => <div data-testid="people-table">People table</div>,
}));

vi.mock('@/components/panels/edit', () => ({
  UserEditPanel: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="add-person-panel">
        Add person panel
        <button type="button" onClick={onClose}>
          Close person panel
        </button>
      </div>
    ) : null,
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="current-location">{`${location.pathname}${location.search}`}</div>;
}

describe('BrowsePeoplePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBrowsePeopleReturn = {
      people: [
        {
          id: 'person-1',
          firstName: 'Ada',
          lastName: 'Handler',
          email: 'ada@example.com',
          roles: ['exhibitor'],
        },
      ],
      filteredPeople: [
        {
          id: 'person-1',
          firstName: 'Ada',
          lastName: 'Handler',
          email: 'ada@example.com',
          roles: ['exhibitor'],
        },
      ],
      isLoading: false,
      error: null,
      filters: { search: '', role: 'all' },
      setFilters: vi.fn(),
      hasActiveFilters: false,
      clearAllFilters: vi.fn(),
      availableRoles: ['exhibitor'],
    };
  });

  it('opens the add person panel from the add query parameter', () => {
    render(<BrowsePeoplePage />, { initialRoute: '/people?add=true' });

    expect(screen.getByTestId('add-person-panel')).toBeInTheDocument();
  });

  it('removes the add query parameter when the add person panel closes', async () => {
    const { user } = render(
      <>
        <BrowsePeoplePage />
        <LocationProbe />
      </>,
      { initialRoute: '/people?add=true' }
    );

    expect(screen.getByTestId('current-location')).toHaveTextContent('/people?add=true');

    await user.click(screen.getByRole('button', { name: 'Close person panel' }));

    expect(screen.queryByTestId('add-person-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('current-location')).toHaveTextContent('/people');
  });
});
