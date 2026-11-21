import { render, screen } from '@/test/utils/testUtils';
import type { ClassAssignment, Volunteer } from '@/types/volunteer';
import { FocusedClassStewards } from './FocusedClassStewards';

const stewards = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('@/hooks/queries/useClassStewards', () => ({
  useClassStewards: () => stewards.current,
}));

const volunteer = (id: string, name: string, personId: string | null = null): Volunteer => ({
  id,
  personId,
  name,
  phone: null,
  notes: null,
  isAvailable: true,
  showId: 'show-1',
  createdAt: '',
  updatedAt: '',
});
const assignment = (over: Partial<ClassAssignment>): ClassAssignment => ({
  id: 'a-1',
  volunteerId: 'vol-1',
  classId: 'class-1',
  roleName: 'Table Steward',
  status: 'assigned',
  notes: null,
  createdAt: '',
  volunteerName: 'Sarah Miller',
  ...over,
});

function ready(assignments: ClassAssignment[], conflictMap = new Map<string, Set<string>>()) {
  const byClass = new Map<string, ClassAssignment[]>();
  for (const a of assignments) byClass.set(a.classId, [...(byClass.get(a.classId) ?? []), a]);
  stewards.current = {
    status: 'ready',
    conflictsStatus: 'ready',
    volunteers: [volunteer('vol-1', 'Sarah Miller', 'p-1'), volunteer('vol-2', 'Tom Kennedy')],
    assignments,
    assignmentsByClass: byClass,
    conflictMap,
    onAssign: vi.fn(),
    onUnassign: vi.fn(),
  };
}

describe('FocusedClassStewards (MYK9-2328)', () => {
  it('lists the four ring jobs with only this class’s people', () => {
    ready([
      assignment({}),
      assignment({
        id: 'a-2',
        classId: 'class-2',
        volunteerId: 'vol-2',
        volunteerName: 'Tom Kennedy',
      }),
    ]);
    render(<FocusedClassStewards showId="show-1" classId="class-1" />);

    for (const role of ['Table Steward', 'Gate Steward', 'Timer', 'Ring Steward']) {
      expect(screen.getByRole('button', { name: `Assign ${role}` })).toBeInTheDocument();
    }
    expect(screen.getByText('Sarah M.')).toBeInTheDocument();
    expect(screen.queryByText('Tom K.')).not.toBeInTheDocument();
    expect(screen.queryByText('No steward yet.')).not.toBeInTheDocument();
  });

  it('says when the class has no steward, and links to the whole volunteer list', () => {
    ready([]);
    render(<FocusedClassStewards showId="show-1" classId="class-1" />);
    expect(screen.getByText('No steward yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All volunteers' })).toHaveAttribute(
      'href',
      '/secretary/volunteers?showId=show-1'
    );
  });

  it('removes a steward through the shared assignment', async () => {
    ready([assignment({})]);
    const { user } = render(<FocusedClassStewards showId="show-1" classId="class-1" />);
    await user.click(screen.getByRole('button', { name: 'Remove Sarah Miller' }));
    expect(stewards.current.onUnassign).toHaveBeenCalledWith('a-1');
  });

  it('warns on a steward who handles a dog in this class', () => {
    ready([assignment({})], new Map([['vol-1', new Set(['class-1'])]]));
    render(<FocusedClassStewards showId="show-1" classId="class-1" />);
    expect(screen.getByTestId('volunteer-chip').querySelector('[title*="onflict"]')).not.toBeNull();
  });

  it('sends the secretary to the Volunteers page when the show has no volunteers', () => {
    ready([]);
    stewards.current = { ...stewards.current, volunteers: [] };
    render(<FocusedClassStewards showId="show-1" classId="class-1" />);
    expect(screen.getByRole('link', { name: 'Add them on the Volunteers page' })).toHaveAttribute(
      'href',
      '/secretary/volunteers?showId=show-1'
    );
    expect(screen.queryByRole('button', { name: /^Assign/ })).not.toBeInTheDocument();
  });

  it('says why the list is missing when it cannot load', () => {
    stewards.current = { status: 'unavailable', conflictMap: new Map() };
    render(<FocusedClassStewards showId="show-1" classId="class-1" />);
    expect(
      screen.getByText("We couldn't load the stewards. Try again when you're back online.")
    ).toBeInTheDocument();
  });
});
