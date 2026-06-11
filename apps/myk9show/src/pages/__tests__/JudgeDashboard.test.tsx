import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import JudgeDashboard from '../JudgeDashboard';
import { localIsoDate, type JudgeClass } from '../judgeStatsUtils';

const mockNavigate = vi.hoisted(() => vi.fn());
const mockUseJudgeAssignments = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/queries/useJudgeAssignments', () => ({
  useJudgeAssignments: () => mockUseJudgeAssignments(),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'user-1' },
    firstName: 'Pat',
    userWithRoles: { databaseUserId: 'person-1' },
  }),
}));

vi.mock('@/services/AuditService', () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

const TODAY = localIsoDate(Date.now());
// Bucket fixtures in the device's own zone so device-local TODAY == "today".
const DEVICE_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

const makeAssignment = (overrides: Partial<JudgeClass> = {}): JudgeClass => ({
  id: 'assignment-1',
  showId: 'show-1',
  trialId: 'trial-1',
  classId: 'class-1',
  name: 'Interior Novice A',
  element: 'Interior',
  level: 'Novice',
  trialDate: TODAY,
  trialTimezone: DEVICE_TZ,
  scheduledTime: new Date(`${TODAY}T09:00:00`),
  ringNumber: null,
  totalEntries: 20,
  completedEntries: 5,
  status: 'pending',
  ...overrides,
});

const hookState = (overrides: Record<string, unknown> = {}) => ({
  assignments: [] as JudgeClass[],
  isLoading: false,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
  ...overrides,
});

describe('JudgeDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while assignments are fetching', () => {
    mockUseJudgeAssignments.mockReturnValue(hookState({ isLoading: true }));

    render(<JudgeDashboard />);

    expect(screen.getByText(/loading your assignments/i)).toBeInTheDocument();
  });

  it('shows a plain-English error state and retries on click', async () => {
    const refetch = vi.fn();
    mockUseJudgeAssignments.mockReturnValue(hookState({ isError: true, refetch }));

    const { user } = render(<JudgeDashboard />);

    expect(screen.getByText(/we couldn(')?t load your assignments/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows guidance when the judge has no assignments at all', () => {
    mockUseJudgeAssignments.mockReturnValue(hookState());

    render(<JudgeDashboard />);

    expect(screen.getByText('No Judging Assignments Yet')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /open ringside scoring/i })
    ).not.toBeInTheDocument();
  });

  it('opens ringside scoring for the active show from the header button', async () => {
    mockUseJudgeAssignments.mockReturnValue(hookState({ assignments: [makeAssignment()] }));

    const { user } = render(<JudgeDashboard />);

    await user.click(screen.getByRole('button', { name: /open ringside scoring/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/at-show/show-1');
  });

  it('deep-links Start Judging to the ringside class entry list', async () => {
    mockUseJudgeAssignments.mockReturnValue(hookState({ assignments: [makeAssignment()] }));

    const { user } = render(<JudgeDashboard />);

    await user.click(screen.getByRole('button', { name: /start judging/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/at-show/show-1/class/class-1');
  });

  it('labels the action Continue Judging for an in-progress class', () => {
    mockUseJudgeAssignments.mockReturnValue(
      hookState({ assignments: [makeAssignment({ status: 'in-progress' })] })
    );

    render(<JudgeDashboard />);

    expect(screen.getByRole('button', { name: /continue judging/i })).toBeInTheDocument();
  });

  it('links View Results on a completed class to the ringside entry list', async () => {
    mockUseJudgeAssignments.mockReturnValue(
      hookState({
        assignments: [
          makeAssignment({ id: 'assignment-9', classId: 'class-9', status: 'completed' }),
        ],
      })
    );

    const { user } = render(<JudgeDashboard />);

    await user.click(screen.getAllByRole('button', { name: /view results/i })[0]);

    expect(mockNavigate).toHaveBeenCalledWith('/at-show/show-1/class/class-9');
  });

  it('disables Retry while the refetch is in flight', () => {
    mockUseJudgeAssignments.mockReturnValue(hookState({ isError: true, isFetching: true }));

    render(<JudgeDashboard />);

    expect(screen.getByRole('button', { name: /retrying/i })).toBeDisabled();
  });

  it('shows upcoming assignments with their date and no judging action', async () => {
    mockUseJudgeAssignments.mockReturnValue(
      hookState({
        assignments: [
          makeAssignment({
            id: 'u1',
            name: 'Future Container Class',
            trialDate: '2099-01-05',
            scheduledTime: new Date('2099-01-05T09:00:00'),
          }),
        ],
      })
    );

    const { user } = render(<JudgeDashboard />);

    await user.click(screen.getByRole('tab', { name: /upcoming/i }));

    expect(screen.getByText('Future Container Class')).toBeInTheDocument();
    const expectedDate = new Date('2099-01-05T09:00:00').toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    });
    expect(screen.getByText(expectedDate)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start judging/i })).not.toBeInTheDocument();
  });

  it('keeps a past unfinished class reachable from the Completed tab', async () => {
    mockUseJudgeAssignments.mockReturnValue(
      hookState({
        assignments: [
          makeAssignment({
            id: 'p1',
            classId: 'class-past',
            name: 'Yesterday Buried Excellent',
            trialDate: '2020-01-01',
            scheduledTime: new Date('2020-01-01T09:00:00'),
            status: 'pending',
          }),
        ],
      })
    );

    const { user } = render(<JudgeDashboard />);

    await user.click(screen.getByRole('tab', { name: /completed/i }));
    await user.click(screen.getByRole('button', { name: /start judging/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/at-show/show-1/class/class-past');
  });

  it('does not render the removed dead buttons', () => {
    mockUseJudgeAssignments.mockReturnValue(hookState({ assignments: [makeAssignment()] }));

    render(<JudgeDashboard />);

    expect(screen.queryByRole('button', { name: /view schedule/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open timer practice/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /view guidelines/i })).not.toBeInTheDocument();
  });
});
