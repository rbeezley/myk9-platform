import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ClubsListView } from '../ClubsListView';
import type { Club } from '@/types/club-types';

const clubs: Club[] = [
  {
    id: 'club-1',
    name: 'Golden State Dog Club',
    clubNumber: 'GS-001',
    email: 'info@goldenstatedc.org',
    phone: '555-0100',
    website: 'https://goldenstatedc.org',
    description: 'A calm club table row',
    address: {
      street: '123 Main St',
      city: 'Sacramento',
      state: 'CA',
      zipCode: '95814',
      country: 'US',
    },
    logo: '',
    coverImage: '',
    accentColor: '',
    clubType: 'all-breed',
    upcomingShows: [],
    pastShows: [],
    memberIds: ['person-1', 'person-2'],
  },
];

describe('ClubsListView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders clubs in the shared DataTable with standard controls', () => {
    render(<ClubsListView clubs={clubs} clubShowCounts={new Map([['club-1', 3]])} />);

    expect(screen.getByTestId('clubs-list')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /club/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /upcoming shows/i })).toBeInTheDocument();
    expect(screen.getByText('Golden State Dog Club')).toBeInTheDocument();
    expect(screen.getByText('Sacramento, CA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /compact density/i })).toBeInTheDocument();
  });
});

describe('ClubsListView empty cells', () => {
  it('shows an em dash, not a hyphen, for a missing type and location', () => {
    localStorage.clear();
    const bare = {
      ...clubs[0],
      id: 'club-2',
      name: 'Bare Club',
      clubType: undefined,
      address: undefined,
    } as unknown as Club;
    render(<ClubsListView clubs={[bare]} clubShowCounts={new Map()} />);

    const row = screen.getByText('Bare Club').closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('—');
    expect(row.textContent).not.toMatch(/(^|[^\w])-($|[^\w])/);
  });
});
