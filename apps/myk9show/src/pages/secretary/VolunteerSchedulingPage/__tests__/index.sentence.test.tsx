import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { GENERAL_DUTY_ROLES } from '@/types/volunteer';
import VolunteerSchedulingPage from '../index';

const CLASSES = [
  { id: 'c1', name: 'Novice A', trialId: 't1', meta: 'Interior' },
  { id: 'c2', name: 'Advanced B', trialId: 't1', meta: 'Exterior' },
];

const mutation = { mutate: vi.fn(), mutateAsync: vi.fn() };

vi.mock('@/hooks/queries/volunteerQueries', () => ({
  useVolunteers: () => ({ data: [], isLoading: false }),
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
  it('names the search, and "Show all classes and duties" clears it', async () => {
    const { user } = render(<VolunteerSchedulingPage />);
    const total = CLASSES.length + GENERAL_DUTY_ROLES.length;

    expect(screen.getByRole('status')).toHaveTextContent(
      `Showing all ${total} classes and duties.`
    );

    await user.type(screen.getByPlaceholderText('Search classes, volunteers...'), 'Novice');
    expect(screen.getByRole('status')).toHaveTextContent(
      `Showing 1 of ${total} classes and duties (matching “Novice”).`
    );

    await user.click(screen.getByRole('button', { name: 'Show all classes and duties' }));
    expect(screen.getByPlaceholderText('Search classes, volunteers...')).toHaveValue('');
    expect(screen.getByText('Advanced B')).toBeInTheDocument();
  });
});
