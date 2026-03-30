import { render, screen } from '@/test/utils/testUtils';
import { VolunteerPool } from '../VolunteerPool';
import type { Volunteer } from '@/types/volunteer';

const makeVolunteer = (overrides: Partial<Volunteer> = {}): Volunteer => ({
  id: 'v-1',
  personId: null,
  name: 'Sarah Miller',
  phone: null,
  notes: null,
  isAvailable: true,
  showId: 'show-1',
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

describe('VolunteerPool', () => {
  const defaultProps = {
    volunteers: [
      makeVolunteer({ id: 'v-1', name: 'Sarah Miller' }),
      makeVolunteer({ id: 'v-2', name: 'Mike Roberts', personId: 'p-2' }),
    ],
    onAddClick: vi.fn(),
    onEditClick: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the volunteer count badge', () => {
    render(<VolunteerPool {...defaultProps} />);
    expect(screen.getByText('2 volunteers')).toBeInTheDocument();
  });

  it('renders each volunteer as a chip with display name', () => {
    render(<VolunteerPool {...defaultProps} />);
    expect(screen.getByText('Sarah M.')).toBeInTheDocument();
    expect(screen.getByText('Mike R.')).toBeInTheDocument();
  });

  it('shows "(walk-up)" label for volunteers without personId', () => {
    render(<VolunteerPool {...defaultProps} />);
    // Sarah has no personId — should show walk-up label
    expect(screen.getByText(/walk-up/)).toBeInTheDocument();
  });

  it('renders Add Volunteer button', () => {
    render(<VolunteerPool {...defaultProps} />);
    expect(screen.getByRole('button', { name: /add volunteer/i })).toBeInTheDocument();
  });

  it('calls onAddClick when Add Volunteer is clicked', async () => {
    const { user } = render(<VolunteerPool {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /add volunteer/i }));
    expect(defaultProps.onAddClick).toHaveBeenCalledOnce();
  });

  it('calls onEditClick with volunteer when chip is clicked', async () => {
    const { user } = render(<VolunteerPool {...defaultProps} />);
    await user.click(screen.getByText('Sarah M.'));
    expect(defaultProps.onEditClick).toHaveBeenCalledWith(defaultProps.volunteers[0]);
  });

  it('shows empty state when no volunteers', () => {
    render(<VolunteerPool volunteers={[]} onAddClick={vi.fn()} onEditClick={vi.fn()} />);
    expect(screen.getByText('0 volunteers')).toBeInTheDocument();
  });

  it('shows singular "1 volunteer" for single volunteer', () => {
    render(
      <VolunteerPool volunteers={[makeVolunteer()]} onAddClick={vi.fn()} onEditClick={vi.fn()} />
    );
    expect(screen.getByText('1 volunteer')).toBeInTheDocument();
  });
});
