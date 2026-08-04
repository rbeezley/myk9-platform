import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TrialDetailsMain from '../TrialDetailsMain';
import type { Trial, TrialClass } from '../types/trial.types';
import type { TrialStatisticsData } from '../TrialDetail/TrialStatistics';

// Trial Details is a public route. This file pins the one rule that makes it
// safe for exhibitors: staff-only sections are gated on `canManage`, while the
// schedule stays visible to everyone (MYK9-123).

vi.mock('@/components/schedule', () => ({
  TrialTimeline: () => <div data-testid="trial-timeline" />,
}));

vi.mock('../TrialDetail/TrialClassesTable', () => ({
  TrialClassesTable: () => <div data-testid="trial-classes-table" />,
}));

vi.mock('@/features/judge-supplies/JudgeSuppliesSection', () => ({
  JudgeSuppliesSection: () => <div data-testid="judge-supplies-section" />,
}));

const statistics: TrialStatisticsData = {
  judges: { total: 2, active: 1, onBreak: 0, percentChange: 0 },
  classes: { total: 4, upcoming: 3, completed: 1, percentChange: 0 },
  entries: { total: 12, upcoming: 10, completed: 2, percentChange: 0 },
  qualifiedRate: { percent: 50, qualified: 1, total: 2, percentChange: 0 },
};

const trial = {
  id: 'trial-1',
  showId: 'show-1',
  classes: [] as TrialClass[],
} as Trial & { classes?: TrialClass[] };

function renderMain(canManage?: boolean) {
  return render(
    <TrialDetailsMain
      trial={trial}
      statistics={statistics}
      {...(canManage !== undefined && { canManage })}
      onEditClass={vi.fn()}
      onDeleteClass={vi.fn()}
    />
  );
}

describe('TrialDetailsMain judge supplies gate', () => {
  it('renders judge supplies for staff', () => {
    renderMain(true);

    expect(screen.getByTestId('judge-supplies-section')).toBeInTheDocument();
  });

  it('hides judge supplies from an exhibitor', () => {
    renderMain(false);

    expect(screen.queryByTestId('judge-supplies-section')).not.toBeInTheDocument();
  });

  it('denies by default when no gate is passed', () => {
    renderMain();

    expect(screen.queryByTestId('judge-supplies-section')).not.toBeInTheDocument();
  });

  it('keeps the schedule timeline visible to exhibitors', () => {
    renderMain(false);

    expect(screen.getByTestId('trial-timeline')).toBeInTheDocument();
  });
});
