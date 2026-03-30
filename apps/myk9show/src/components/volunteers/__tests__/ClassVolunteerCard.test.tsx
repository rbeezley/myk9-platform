import { render, screen } from '@/test/utils/testUtils';
import { ClassVolunteerCard } from '../ClassVolunteerCard';
import { RING_ROLES } from '@/types/volunteer';
import type { Volunteer, ClassAssignment } from '@/types/volunteer';

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

describe('ClassVolunteerCard', () => {
  const defaultProps = {
    classId: 'c-1',
    className: 'Containers Novice',
    classMeta: 'Ring 1 • 9:00 AM • Judge: Jane Doe',
    assignments: [
      {
        id: 'a-1',
        volunteerId: 'v-1',
        classId: 'c-1',
        roleName: 'Gate Steward',
        status: 'assigned',
        notes: null,
        createdAt: '',
        volunteerName: 'Sarah Miller',
      },
    ] as ClassAssignment[],
    volunteers: [makeVol()],
    conflictMap: new Map<string, Set<string>>(),
    onAssign: vi.fn(),
    onUnassign: vi.fn(),
  };

  it('renders the class name and metadata', () => {
    render(<ClassVolunteerCard {...defaultProps} />);
    expect(screen.getByText('Containers Novice')).toBeInTheDocument();
    expect(screen.getByText('Ring 1 • 9:00 AM • Judge: Jane Doe')).toBeInTheDocument();
  });

  it('renders a row for each ring role', () => {
    render(<ClassVolunteerCard {...defaultProps} />);
    for (const role of RING_ROLES) {
      expect(screen.getByText(role)).toBeInTheDocument();
    }
  });

  it('renders assigned volunteer chips in the correct role row', () => {
    render(<ClassVolunteerCard {...defaultProps} />);
    expect(screen.getByText('Sarah M.')).toBeInTheDocument();
  });

  it('renders an assign button for each role', () => {
    render(<ClassVolunteerCard {...defaultProps} />);
    const assignButtons = screen.getAllByRole('button', { name: /assign/i });
    expect(assignButtons.length).toBe(RING_ROLES.length);
  });

  it('shows conflict badge on chip when volunteer has a conflict', () => {
    const conflictMap = new Map([['v-1', new Set(['c-1'])]]);
    render(<ClassVolunteerCard {...defaultProps} conflictMap={conflictMap} />);
    expect(screen.getByTitle(/conflict/i)).toBeInTheDocument();
  });

  it('renders multiple volunteers per role', () => {
    const assignments: ClassAssignment[] = [
      {
        id: 'a-1',
        volunteerId: 'v-1',
        classId: 'c-1',
        roleName: 'Ring Steward',
        status: 'assigned',
        notes: null,
        createdAt: '',
        volunteerName: 'Sarah Miller',
      },
      {
        id: 'a-2',
        volunteerId: 'v-2',
        classId: 'c-1',
        roleName: 'Ring Steward',
        status: 'assigned',
        notes: null,
        createdAt: '',
        volunteerName: 'Mike Roberts',
      },
    ];
    const volunteers = [makeVol(), makeVol({ id: 'v-2', name: 'Mike Roberts' })];
    render(
      <ClassVolunteerCard {...defaultProps} assignments={assignments} volunteers={volunteers} />
    );
    expect(screen.getByText('Sarah M.')).toBeInTheDocument();
    expect(screen.getByText('Mike R.')).toBeInTheDocument();
  });
});
