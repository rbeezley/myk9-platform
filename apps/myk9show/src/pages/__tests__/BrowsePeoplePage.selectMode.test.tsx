import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { waitFor } from '@testing-library/react';
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

const createdPerson = { ...ada, id: 'new-1', firstName: 'New', lastName: 'Person' };
vi.mock('@/store/userStore', () => ({
  useUserStore: () => ({ addUser: vi.fn().mockResolvedValue(createdPerson) }),
}));

vi.mock('@/components/users/browse', () => ({
  PeopleCompactList: () => <div data-testid="people-compact">compact list</div>,
  PeopleGridView: () => <div data-testid="people-grid">grid</div>,
  PeopleTableView: ({
    onOpenPerson,
    onSelectionChange,
  }: {
    onOpenPerson?: (p: typeof ada) => void;
    onSelectionChange?: (selected: (typeof ada)[]) => void;
  }) => (
    <>
      <button type="button" data-testid="people-table" onClick={() => onOpenPerson?.(ada)}>
        table
      </button>
      <button type="button" onClick={() => onSelectionChange?.([ada])}>
        tick Ada
      </button>
    </>
  ),
  PeopleListToolbar: ({ resultLineExtra }: { resultLineExtra?: React.ReactNode }) => (
    <div>{resultLineExtra}</div>
  ),
  PeopleBulkBar: ({ selectedPeople }: { selectedPeople: unknown[] }) => (
    <div data-testid="people-bulk-bar">{selectedPeople.length} selected</div>
  ),
}));

vi.mock('@/components/panels/edit', () => ({
  UserEditPanel: ({
    open,
    onSave,
  }: {
    open: boolean;
    onSave: (data: Record<string, unknown>) => Promise<void>;
  }) =>
    open ? (
      <button type="button" onClick={() => void onSave({ firstName: 'New', lastName: 'Person' })}>
        save new person
      </button>
    ) : null,
}));

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

  describe('ticked rows never outlive select mode', () => {
    const tickThenReenter = async (leave: () => Promise<void>) => {
      renderWide();
      await userEvent.click(screen.getByRole('button', { name: 'Select people' }));
      await userEvent.click(screen.getByRole('button', { name: 'tick Ada' }));
      expect(screen.getByTestId('people-bulk-bar')).toHaveTextContent('1 selected');

      await leave();
      await userEvent.click(screen.getByRole('button', { name: 'Select people' }));
      expect(screen.getByTestId('people-bulk-bar')).toHaveTextContent('0 selected');
    };

    it('after Done', async () => {
      await tickThenReenter(() => userEvent.click(screen.getByRole('button', { name: 'Done' })));
    });

    it('after opening a person from the table', async () => {
      await tickThenReenter(() => userEvent.click(screen.getByTestId('people-table')));
    });

    it('after creating a person while selecting', async () => {
      await tickThenReenter(async () => {
        await userEvent.click(screen.getByRole('button', { name: 'Add Person' }));
        await userEvent.click(screen.getByRole('button', { name: 'save new person' }));
        // The new person opens beside the list: select mode is over.
        await waitFor(() =>
          expect(screen.getByTestId('current-location')).toHaveTextContent('/people/new-1')
        );
        expect(screen.getByTestId('people-compact')).toBeInTheDocument();
      });
    });
  });

  it('select mode ends when the split is lost and does not return when it comes back', async () => {
    const { rerender } = render(<BrowsePeoplePage detail={<p>detail pane</p>} />);
    await userEvent.click(screen.getByRole('button', { name: 'Select people' }));
    expect(screen.getByTestId('people-table')).toBeInTheDocument();

    rerender(<BrowsePeoplePage />); // narrow window: no split
    rerender(<BrowsePeoplePage detail={<p>detail pane</p>} />); // wide again

    expect(screen.getByTestId('people-compact')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select people' })).toBeInTheDocument();
  });

  it('offers no select mode on a narrow screen, where the table is always the list', () => {
    mockViewportWidth(1000);
    render(<BrowsePeoplePage />);
    expect(screen.queryByRole('button', { name: 'Select people' })).not.toBeInTheDocument();
    expect(screen.getByTestId('people-table')).toBeInTheDocument();
  });
});
