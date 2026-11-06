import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { GENERAL_DUTY_ROLES } from '@/types/volunteer';
import VolunteerSchedulingPage from '../index';

const CLASSES = [
  { id: 'c1', name: 'Novice A', trialId: 't1', meta: 'Interior' },
  { id: 'c2', name: 'Advanced B', trialId: 't1', meta: 'Exterior' },
];

const mutation = { mutate: vi.fn(), mutateAsync: vi.fn() };
const volunteersQuery = vi.hoisted(() => ({
  current: { data: [] as unknown[], isLoading: false, isError: false, refetch: () => {} },
}));

vi.mock('@/hooks/queries/volunteerQueries', () => ({
  useVolunteers: () => volunteersQuery.current,
  useVolunteerClassAssignments: () => ({ data: [], isLoading: false }),
  useVolunteerGeneralAssignments: () => ({ data: [], isLoading: false }),
  useVolunteerConflicts: () => ({ data: new Map() }),
  useShowClassesForVolunteers: () => ({ data: CLASSES, isLoading: false }),
  useAddVolunteer: () => mutation,
  useUpdateVolunteer: () => mutation,
  useDeleteVolunteer: () => mutation,
  useAssignToClass: () => mutation,
  useUnassignFromClass: () => mutation,
  useAssignToGeneralDuty: () => mutation,
  useUnassignFromGeneralDuty: () => mutation,
}));

vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (s: unknown) => unknown) =>
    selector({ selectedShowId: 'show-1', selectShow: vi.fn() }),
}));
vi.mock('@/store/trialStore', () => ({ useTrialStore: () => ({ trials: [] }) }));
vi.mock('@/components/volunteers/VolunteerPool', () => ({ VolunteerPool: () => null }));
vi.mock('@/components/volunteers/VolunteerDialog', () => ({ VolunteerDialog: () => null }));
vi.mock('@/components/volunteers/ClassVolunteerCard', () => ({
  ClassVolunteerCard: ({ className }: { className: string }) => <div>{className}</div>,
}));
vi.mock('@/components/volunteers/GeneralDutyCard', () => ({
  GeneralDutyCard: () => null,
}));

describe('VolunteerSchedulingPage status sentence (MYK9-906)', () => {
  beforeEach(() => {
    volunteersQuery.current = { data: [], isLoading: false, isError: false, refetch: () => {} };
  });

  it('names the search, and "Show all classes and duties" clears it', async () => {
    const { user } = render(<VolunteerSchedulingPage />);
    const total = CLASSES.length + GENERAL_DUTY_ROLES.length;

    expect(screen.getByRole('status')).toHaveTextContent(
      `Showing all ${total} classes and duties.`
    );

    await user.type(screen.getByPlaceholderText('Search classes, volunteers...'), 'Novice');
    expect(screen.getByRole('status')).toHaveTextContent(
      `Showing 1 of ${total} classes and duties.`
    );

    await user.click(screen.getByRole('button', { name: 'Show all classes and duties' }));
    expect(screen.getByPlaceholderText('Search classes, volunteers...')).toHaveValue('');
    expect(screen.getByText('Advanced B')).toBeInTheDocument();
  });
});

describe('VolunteerSchedulingPage when the volunteers fail to load (MYK9-1726)', () => {
  it('shows a load error with Try again instead of the pickers, which would say "No volunteers yet"', async () => {
    const refetch = vi.fn();
    volunteersQuery.current = { data: [], isLoading: false, isError: true, refetch };
    const { user } = render(<VolunteerSchedulingPage />);

    expect(screen.getByText("Couldn't load this show's volunteers")).toBeInTheDocument();
    expect(screen.queryByText('Novice A')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
