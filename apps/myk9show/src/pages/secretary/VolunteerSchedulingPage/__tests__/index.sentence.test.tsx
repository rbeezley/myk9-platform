import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { GENERAL_DUTY_ROLES } from '@/types/volunteer';
import VolunteerSchedulingPage from '../index';

const CLASSES = [
  { id: 'c1', name: 'Novice A', trialId: 't1', meta: 'Interior' },
  { id: 'c2', name: 'Advanced B', trialId: 't1', meta: 'Exterior' },
];

const mutation = { mutate: vi.fn(), mutateAsync: vi.fn() };
type QueryResult = {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
};
const queries = vi.hoisted(() => ({
  volunteers: undefined as unknown as QueryResult,
  classAssignments: undefined as unknown as QueryResult,
  generalAssignments: undefined as unknown as QueryResult,
  classes: undefined as unknown as QueryResult,
}));
const loaded = (data: unknown): QueryResult => ({
  data,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
});
const failed = (data?: unknown): QueryResult => ({
  data,
  isLoading: false,
  isError: true,
  refetch: vi.fn(),
});

vi.mock('@/hooks/queries/volunteerQueries', () => ({
  useVolunteers: () => queries.volunteers,
  useVolunteerClassAssignments: () => queries.classAssignments,
  useVolunteerGeneralAssignments: () => queries.generalAssignments,
  useVolunteerConflicts: () => ({ data: new Map() }),
  useShowClassesForVolunteers: () => queries.classes,
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

beforeEach(() => {
  queries.volunteers = loaded([]);
  queries.classAssignments = loaded([]);
  queries.generalAssignments = loaded([]);
  queries.classes = loaded(CLASSES);
});

describe('VolunteerSchedulingPage status sentence (MYK9-906)', () => {
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

describe('VolunteerSchedulingPage load gate (MYK9-1726)', () => {
  function expectLoadError() {
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Volunteer Scheduling');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      "Couldn't load this show's volunteer schedule"
    );
    expect(screen.queryByText('Novice A')).not.toBeInTheDocument();
  }

  it('shows the load error, not "No volunteers yet", when volunteers failed with nothing cached', async () => {
    queries.volunteers = failed();
    const { user } = render(<VolunteerSchedulingPage />);

    expectLoadError();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(queries.volunteers.refetch).toHaveBeenCalledTimes(1);
    expect(queries.classes.refetch).not.toHaveBeenCalled();
  });

  it('shows the load error, not "no classes yet", when classes failed with nothing cached', async () => {
    queries.classes = failed();
    queries.classAssignments = failed();
    const { user } = render(<VolunteerSchedulingPage />);

    expectLoadError();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(queries.classes.refetch).toHaveBeenCalledTimes(1);
    expect(queries.classAssignments.refetch).toHaveBeenCalledTimes(1);
    expect(queries.volunteers.refetch).not.toHaveBeenCalled();
  });

  it('keeps the working page when a background refresh fails with data cached', () => {
    queries.volunteers = failed([]);
    queries.classes = failed(CLASSES);
    render(<VolunteerSchedulingPage />);

    expect(screen.getByText('Novice A')).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't load/)).not.toBeInTheDocument();
  });
});
