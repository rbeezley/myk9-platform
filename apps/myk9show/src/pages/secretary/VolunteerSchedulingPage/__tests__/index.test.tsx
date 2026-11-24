import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { GENERAL_DUTY_ROLES } from '@/types/volunteer';
import VolunteerSchedulingPage from '../index';

const mutation = { mutate: vi.fn(), mutateAsync: vi.fn() };
type QueryResult = {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
};
const queries = vi.hoisted(() => ({
  volunteers: undefined as unknown as QueryResult,
  generalAssignments: undefined as unknown as QueryResult,
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
  useVolunteerGeneralAssignments: () => queries.generalAssignments,
  useAddVolunteer: () => mutation,
  useUpdateVolunteer: () => mutation,
  useDeleteVolunteer: () => mutation,
  useAssignToGeneralDuty: () => mutation,
  useUnassignFromGeneralDuty: () => mutation,
}));

vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (s: unknown) => unknown) =>
    selector({ selectedShowId: 'show-1', selectShow: vi.fn() }),
}));
vi.mock('@/components/volunteers/VolunteerPool', () => ({ VolunteerPool: () => null }));
vi.mock('@/components/volunteers/VolunteerDialog', () => ({ VolunteerDialog: () => null }));
vi.mock('@/components/volunteers/GeneralDutyCard', () => ({
  GeneralDutyCard: ({ roleName }: { roleName: string }) => <div>{roleName}</div>,
}));

beforeEach(() => {
  queries.volunteers = loaded([]);
  queries.generalAssignments = loaded([]);
});

describe('VolunteerSchedulingPage (MYK9-2330)', () => {
  it('shows every general duty and no per-class steward cards', () => {
    render(<VolunteerSchedulingPage />);

    for (const role of GENERAL_DUTY_ROLES) {
      expect(screen.getByText(role)).toBeInTheDocument();
    }
    expect(screen.queryByText('Table Steward')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search classes/i)).not.toBeInTheDocument();
  });

  it("links to this show's Show Desk for steward assignment", () => {
    render(<VolunteerSchedulingPage />);

    expect(screen.getByRole('link', { name: 'Show Desk' })).toHaveAttribute(
      'href',
      '/shows/show-1'
    );
  });
});

describe('VolunteerSchedulingPage load gate (MYK9-1726)', () => {
  function expectLoadError() {
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Volunteer Scheduling');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      "Couldn't load this show's volunteer schedule"
    );
    expect(screen.queryByText('Hospitality')).not.toBeInTheDocument();
  }

  it('shows the load error, not "No volunteers yet", when volunteers failed with nothing cached', async () => {
    queries.volunteers = failed();
    const { user } = render(<VolunteerSchedulingPage />);

    expectLoadError();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(queries.volunteers.refetch).toHaveBeenCalledTimes(1);
    expect(queries.generalAssignments.refetch).not.toHaveBeenCalled();
  });

  it('shows the load error when duty assignments failed with nothing cached', async () => {
    queries.generalAssignments = failed();
    const { user } = render(<VolunteerSchedulingPage />);

    expectLoadError();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(queries.generalAssignments.refetch).toHaveBeenCalledTimes(1);
    expect(queries.volunteers.refetch).not.toHaveBeenCalled();
  });

  it('keeps the working page when a background refresh fails with data cached', () => {
    queries.volunteers = failed([]);
    queries.generalAssignments = failed([]);
    render(<VolunteerSchedulingPage />);

    expect(screen.getByText('Hospitality')).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't load/)).not.toBeInTheDocument();
  });
});
