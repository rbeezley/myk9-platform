import { render, screen } from '@/test/utils/testUtils';
import type { ClassAssignment, Volunteer } from '@/types/volunteer';
import { BulkStewardDialog } from './BulkStewardDialog';
import { bulkStewardSummary, bulkStewardTargets } from './bulkStewardModel';

const stewards = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const mutate = vi.hoisted(() => vi.fn());
const pending = vi.hoisted(() => ({ current: false }));
vi.mock('@/hooks/queries/useClassStewards', () => ({
  useClassStewards: () => stewards.current,
}));
vi.mock('@/hooks/queries/volunteerStewardQueries', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/queries/volunteerStewardQueries')>()),
  useAssignToClasses: () => ({ mutate, isPending: pending.current }),
}));

const volunteer = (id: string, name: string): Volunteer => ({
  id,
  personId: null,
  name,
  phone: null,
  notes: null,
  isAvailable: true,
  showId: 'show-1',
  createdAt: '',
  updatedAt: '',
});
const existing: ClassAssignment = {
  id: 'a-1',
  volunteerId: 'vol-1',
  classId: 'class-1',
  roleName: 'Timer',
  status: 'assigned',
  notes: null,
  createdAt: '',
  volunteerName: 'Sarah Miller',
};
const classes = [
  { id: 'class-1', name: 'Container Novice A' },
  { id: 'class-2', name: 'Interior Novice A' },
  { id: 'class-3', name: 'Exterior Novice A' },
];

beforeEach(() => {
  mutate.mockReset();
  pending.current = false;
  stewards.current = {
    status: 'ready',
    conflictsStatus: 'ready',
    volunteers: [volunteer('vol-1', 'Sarah Miller'), volunteer('vol-2', 'Tom Kennedy')],
    assignments: [existing],
    conflictMap: new Map([['vol-1', new Set(['class-2'])]]),
  };
});

describe('BulkStewardDialog (MYK9-2328)', () => {
  it('assigns the chosen person in the chosen job across the selected classes', async () => {
    const { user } = render(
      <BulkStewardDialog showId="show-1" classes={classes} open onOpenChange={vi.fn()} />
    );
    await user.click(screen.getByRole('button', { name: 'Gate Steward' }));
    await user.click(screen.getByRole('button', { name: 'Tom Kennedy' }));
    await user.click(screen.getByRole('button', { name: 'Assign to 3 classes' }));
    expect(mutate).toHaveBeenCalledWith(
      {
        volunteerId: 'vol-2',
        volunteerName: 'Tom Kennedy',
        roleName: 'Gate Steward',
        classIds: ['class-1', 'class-2', 'class-3'],
      },
      expect.anything()
    );
  });

  it('skips a class they already have the job in, and names a class they handle a dog in', async () => {
    const { user } = render(
      <BulkStewardDialog showId="show-1" classes={classes} open onOpenChange={vi.fn()} />
    );
    await user.click(screen.getByRole('button', { name: 'Timer' }));
    await user.click(screen.getByRole('button', { name: 'Sarah Miller' }));
    expect(
      screen.getByText('They already have this job in 1 of these classes; it is skipped.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Sarah Miller handles a dog in Interior Novice A.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign to 2 classes' })).toBeEnabled();
  });

  it('cannot assign until a volunteer is chosen', () => {
    render(<BulkStewardDialog showId="show-1" classes={classes} open onOpenChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Assign to 3 classes' })).toBeDisabled();
  });

  it('points to the Volunteers page when the show has no volunteers', () => {
    stewards.current = { ...stewards.current, volunteers: [] };
    render(<BulkStewardDialog showId="show-1" classes={classes} open onOpenChange={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Add them on the Volunteers page' })).toHaveAttribute(
      'href',
      '/secretary/volunteers?showId=show-1'
    );
  });

  it('holds Assign until the handler check is back', async () => {
    stewards.current = { ...stewards.current, conflictsStatus: 'loading' };
    const { user } = render(
      <BulkStewardDialog showId="show-1" classes={classes} open onOpenChange={vi.fn()} />
    );
    await user.click(screen.getByRole('button', { name: 'Tom Kennedy' }));
    expect(screen.getByText('Checking entries…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign to 3 classes' })).toBeDisabled();
  });

  it('says so when the handler check could not run', async () => {
    stewards.current = { ...stewards.current, conflictsStatus: 'unavailable' };
    const { user } = render(
      <BulkStewardDialog showId="show-1" classes={classes} open onOpenChange={vi.fn()} />
    );
    await user.click(screen.getByRole('button', { name: 'Tom Kennedy' }));
    expect(
      screen.getByText("We couldn't check whether Tom Kennedy handles a dog in these classes.")
    ).toBeInTheDocument();
  });

  it('cannot assign twice while the assignment is saving, but can still be closed', async () => {
    pending.current = true;
    const onOpenChange = vi.fn();
    const { user } = render(
      <BulkStewardDialog showId="show-1" classes={classes} open onOpenChange={onOpenChange} />
    );
    await user.click(screen.getByRole('button', { name: 'Tom Kennedy' }));
    expect(screen.getByRole('button', { name: 'Assign to 3 classes' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes and confirms when the assignment saves', async () => {
    const onOpenChange = vi.fn();
    mutate.mockImplementation((_input, opts: { onSuccess: () => void }) => opts.onSuccess());
    const { user } = render(
      <BulkStewardDialog showId="show-1" classes={classes} open onOpenChange={onOpenChange} />
    );
    await user.click(screen.getByRole('button', { name: 'Tom Kennedy' }));
    await user.click(screen.getByRole('button', { name: 'Assign to 3 classes' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('bulkStewardSummary', () => {
  it('reads "Already assigned" when every class already has them in the job', () => {
    expect(
      bulkStewardSummary({ classes, toAssignIds: [], conflictClassIds: new Set(['class-1']) })
    ).toMatchObject({ confirmLabel: 'Already assigned', alreadyCount: 3, conflictNames: [] });
  });

  it('counts one class in the singular', () => {
    expect(
      bulkStewardSummary({
        classes: classes.slice(0, 1),
        toAssignIds: ['class-1'],
        conflictClassIds: new Set(),
      }).confirmLabel
    ).toBe('Assign to 1 class');
  });
});

describe('bulkStewardTargets', () => {
  it('leaves out a cancelled class and says how many remain', () => {
    expect(
      bulkStewardTargets([
        { id: 'class-1', name: 'Container Novice A', lifecycle: 'not-started' },
        { id: 'class-2', name: 'Interior Novice A', lifecycle: 'cancelled' },
      ])
    ).toEqual({
      targets: [{ id: 'class-1', name: 'Container Novice A' }],
      label: 'Assign steward (1 of 2)',
    });
  });

  it('reads plainly when every ticked class can be staffed', () => {
    expect(bulkStewardTargets(classes).label).toBe('Assign steward');
  });
});
