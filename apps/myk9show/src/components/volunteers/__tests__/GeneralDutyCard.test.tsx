import { render, screen } from '@/test/utils/testUtils';
import { GeneralDutyCard } from '../GeneralDutyCard';
import type { Volunteer, GeneralAssignment } from '@/types/volunteer';

// Mock AssignVolunteerPopover since it's being built in parallel
vi.mock('../AssignVolunteerPopover', () => ({
  AssignVolunteerPopover: ({ onAssign }: { onAssign: (id: string) => void }) => (
    <button type="button" onClick={() => onAssign('v-mock')}>
      Assign
    </button>
  ),
}));

const makeVol = (overrides: Partial<Volunteer> = {}): Volunteer => ({
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

describe('GeneralDutyCard', () => {
  const defaultProps = {
    roleName: 'Hospitality',
    assignments: [] as GeneralAssignment[],
    volunteers: [makeVol()],
    onAssign: vi.fn(),
    onUnassign: vi.fn(),
  };

  it('renders the role name', () => {
    render(<GeneralDutyCard {...defaultProps} />);
    expect(screen.getByText('Hospitality')).toBeInTheDocument();
  });

  it('renders assigned volunteer chips', () => {
    const assignments: GeneralAssignment[] = [
      {
        id: 'ga-1',
        volunteerId: 'v-1',
        showId: 'show-1',
        roleName: 'Hospitality',
        shiftStart: null,
        shiftEnd: null,
        status: 'assigned',
        notes: null,
        createdAt: '',
        volunteerName: 'Sarah Miller',
      },
    ];
    render(<GeneralDutyCard {...defaultProps} assignments={assignments} />);
    expect(screen.getByText('Sarah M.')).toBeInTheDocument();
  });

  it('renders assign button', () => {
    render(<GeneralDutyCard {...defaultProps} />);
    expect(screen.getByRole('button', { name: /assign/i })).toBeInTheDocument();
  });

  it('calls onUnassign when chip X is clicked', async () => {
    const assignments: GeneralAssignment[] = [
      {
        id: 'ga-1',
        volunteerId: 'v-1',
        showId: 'show-1',
        roleName: 'Hospitality',
        shiftStart: null,
        shiftEnd: null,
        status: 'assigned',
        notes: null,
        createdAt: '',
        volunteerName: 'Sarah Miller',
      },
    ];
    const { user } = render(<GeneralDutyCard {...defaultProps} assignments={assignments} />);
    await user.click(screen.getByRole('button', { name: /remove/i }));
    expect(defaultProps.onUnassign).toHaveBeenCalledWith('ga-1');
  });
});
