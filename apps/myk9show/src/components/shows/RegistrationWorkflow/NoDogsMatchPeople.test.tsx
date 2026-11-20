import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { useUserStore } from '@/store/userStore';
import { NoDogsMatchPeople } from './NoDogsMatchPeople';

const addDogPanel = vi.hoisted(() => vi.fn());
const refetch = vi.hoisted(() => vi.fn());

vi.mock('@/components/panels/edit', () => ({
  AddDogPanel: (props: { open: boolean; currentUserPersonId?: string }) => {
    addDogPanel(props);
    return props.open ? <div data-testid="add-dog-panel">{props.currentUserPersonId}</div> : null;
  },
}));
vi.mock('@/hooks/useDogStoreCompat', () => ({ useDogStoreCompat: () => ({ refetch }) }));
vi.mock('@/hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: () => ({ roles: [UserRole.SECRETARY] }),
}));

const props = {
  onDogCreated: vi.fn(),
  showStartDate: '2027-01-22',
  createdFromShowId: 'show-1',
  defaultRegistryId: 'AKC',
};

beforeEach(() => {
  addDogPanel.mockClear();
  useUserStore.setState({
    people: [
      { id: 'p1', firstName: 'Jo', lastName: 'Smith' },
      { id: 'p2', firstName: 'Maria', lastName: 'Gonzalez' },
    ],
    loadUsers: vi.fn(),
  });
});

describe('NoDogsMatchPeople', () => {
  it('lists the matching person with the no-dogs line and opens Add Dog for that owner', async () => {
    const { user } = render(<NoDogsMatchPeople query="smith" {...props} />);

    expect(screen.getByText('Jo Smith')).toBeInTheDocument();
    expect(screen.queryByText('Maria Gonzalez')).toBeNull();
    expect(screen.getByText('No dogs yet. Add a dog for them.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Jo Smith/ }));
    expect(screen.getByTestId('add-dog-panel')).toHaveTextContent('p1');
    expect(addDogPanel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: true,
        currentUserPersonId: 'p1',
        createdFromShowId: 'show-1',
        defaultRegistryId: 'AKC',
      })
    );
  });

  it('renders nothing when no person matches', () => {
    render(<NoDogsMatchPeople query="zzz" {...props} />);
    expect(screen.queryByTestId('no-dogs-match-people')).toBeNull();
    expect(screen.queryByTestId('add-dog-panel')).toBeNull();
  });

  it('loads the directory only when the device holds none', () => {
    const loadUsers = vi.fn();
    useUserStore.setState({ people: [], loadUsers });
    render(<NoDogsMatchPeople query="smith" {...props} />);
    expect(loadUsers).toHaveBeenCalledTimes(1);
  });
});
