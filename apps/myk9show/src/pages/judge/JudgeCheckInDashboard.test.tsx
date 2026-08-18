import { describe, expect, it, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';

import JudgeCheckInDashboard from './JudgeCheckInDashboard';
import { render } from '@/test/utils/testUtils';
import type { JudgeAssignmentsResult } from '@/hooks/queries/useJudgeAssignments';
import type { JudgeClass } from '@/pages/judgeStatsUtils';

const hoisted = vi.hoisted(() => ({
  useJudgeAssignments: vi.fn<() => JudgeAssignmentsResult>(),
}));

vi.mock('@/hooks/queries/useJudgeAssignments', () => ({
  useJudgeAssignments: hoisted.useJudgeAssignments,
}));

vi.mock('@/components/judges/JudgeCheckInInterface', () => ({
  JudgeCheckInInterface: ({ ringNumber }: { ringNumber: string }) => (
    <div>Judge check-in for {ringNumber}</div>
  ),
}));

vi.mock('@/components/stewards/GateStewardInterface', () => ({
  GateStewardInterface: ({ assignedRings }: { assignedRings?: string[] }) => (
    <div>Gate steward rings: {(assignedRings ?? []).join(', ')}</div>
  ),
}));

const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

function assignment(overrides: Partial<JudgeClass> = {}): JudgeClass {
  return {
    id: 'assignment-1',
    showId: 'show-1',
    trialId: 'trial-1',
    classId: 'class-1',
    name: 'Interior Novice A',
    element: 'Interior',
    level: 'Novice',
    trialDate: TODAY,
    trialTimezone: 'America/Chicago',
    scheduledTime: new Date(`${TODAY}T14:00:00.000Z`),
    ringNumber: null,
    totalEntries: 20,
    checkedInEntries: 14,
    completedEntries: 3,
    status: 'pending',
    ...overrides,
  };
}

function mockAssignments(result: Partial<JudgeAssignmentsResult>) {
  hoisted.useJudgeAssignments.mockReturnValue({
    assignments: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...result,
  });
}

describe('JudgeCheckInDashboard', () => {
  beforeEach(() => {
    hoisted.useJudgeAssignments.mockReset();
  });

  it('shows loading state without a false empty assignment message', () => {
    mockAssignments({ assignments: [], isLoading: true });

    render(<JudgeCheckInDashboard />, { initialRoute: '/judge/check-in' });

    expect(screen.getByText(/loading ring assignments/i)).toBeInTheDocument();
    expect(screen.queryByText(/no ring assignments/i)).not.toBeInTheDocument();
  });

  it('shows query errors without a false empty assignment message', () => {
    mockAssignments({ assignments: [], isError: true, error: 'Network error' });

    render(<JudgeCheckInDashboard />, { initialRoute: '/judge/check-in' });

    expect(screen.getByText(/couldn't load ring assignments/i)).toBeInTheDocument();
    expect(screen.getByText(/network error/i)).toBeInTheDocument();
    expect(screen.queryByText(/no ring assignments/i)).not.toBeInTheDocument();
  });

  it('renders returned ring assignments and enables multi-ring view', () => {
    mockAssignments({ assignments: [assignment()] });

    render(<JudgeCheckInDashboard />, { initialRoute: '/judge/check-in' });

    expect(screen.getByText('Interior Novice A')).toBeInTheDocument();
    expect(screen.getByText('20 entries')).toBeInTheDocument();
    const checkedInSummary = screen.getByText('70% ready').parentElement;
    expect(checkedInSummary).toHaveTextContent('14');
    expect(document.querySelector('[data-status="checked-in"]')).toBeInTheDocument();
    expect(document.querySelector('[data-status="conflict"]')).toBeInTheDocument();
    expect(document.querySelector('[data-status="at-gate"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /multi-ring view/i })).toBeEnabled();
  });

  it('uses the class name instead of a raw class id when no ring number is assigned', () => {
    const rawClassId = 'dec1a55e-0000-0000-0000-000000000033';
    mockAssignments({
      assignments: [assignment({ classId: rawClassId, name: 'Interior Advanced' })],
    });

    render(<JudgeCheckInDashboard />, { initialRoute: '/judge/check-in' });

    expect(screen.getByText('Interior Advanced')).toBeInTheDocument();
    expect(screen.queryByText(rawClassId)).not.toBeInTheDocument();
  });

  it('renders a true empty state after loading finishes with no assignments', () => {
    mockAssignments({ assignments: [] });

    render(<JudgeCheckInDashboard />, { initialRoute: '/judge/check-in' });

    expect(screen.getByText(/no ring assignments/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /multi-ring view/i })).toBeDisabled();
  });

  it('does not present a cold entry replica as a confident zero', () => {
    mockAssignments({ assignments: [assignment({ entryCountsAvailable: false })] });

    render(<JudgeCheckInDashboard />, { initialRoute: '/judge/check-in' });

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/entry totals unavailable/i).length).toBeGreaterThan(0);
    expect(screen.queryByText('0 entries')).not.toBeInTheDocument();
  });

  it('labels aggregate totals as partial when one class replica is cold', () => {
    mockAssignments({
      assignments: [
        assignment({ id: 'warm', totalEntries: 20, checkedInEntries: 14 }),
        assignment({
          id: 'cold',
          name: 'Exterior Novice A',
          totalEntries: 30,
          checkedInEntries: 20,
          entryCountsAvailable: false,
        }),
      ],
    });

    render(<JudgeCheckInDashboard />, { initialRoute: '/judge/check-in' });

    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getAllByText(/partial totals · 1 of 2 classes synced/i)).toHaveLength(2);
  });
});
