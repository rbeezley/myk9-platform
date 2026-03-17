import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TrialTimeline } from '../TrialTimeline';
import type { JudgeTimelineData } from '../schedule-timeline.types';
import { CLASS_STATUS } from '@myk9/core';

const mockData: JudgeTimelineData[] = [
  {
    judgeId: 'j1',
    judgeName: 'Jane Smith',
    ringNumber: null,
    elements: [
      {
        element: 'Container',
        startTime: '08:00:00',
        levelRange: 'Nov–Mst',
        status: CLASS_STATUS.COMPLETED,
        levels: [
          { classId: 'c1', level: 'Novice', status: CLASS_STATUS.COMPLETED, entryCount: 12 },
          { classId: 'c2', level: 'Advanced', status: CLASS_STATUS.COMPLETED, entryCount: 8 },
        ],
      },
      {
        element: 'Buried',
        startTime: '09:30:00',
        levelRange: 'Nov–Adv',
        status: CLASS_STATUS.IN_PROGRESS,
        levels: [
          { classId: 'c3', level: 'Novice', status: CLASS_STATUS.COMPLETED, entryCount: 10 },
          { classId: 'c4', level: 'Advanced', status: CLASS_STATUS.IN_PROGRESS, entryCount: 8 },
        ],
      },
    ],
  },
];

vi.mock('@/hooks/queries/useTrialTimeline', () => ({
  useTrialTimeline: () => ({ data: mockData, isLoading: false, error: null, refetch: vi.fn() }),
}));

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('TrialTimeline', () => {
  it('renders judge name', () => {
    renderWithRouter(<TrialTimeline trialId="t1" showId="s1" />);
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('renders judge initials', () => {
    renderWithRouter(<TrialTimeline trialId="t1" showId="s1" />);
    expect(screen.getByText('JS')).toBeInTheDocument();
  });

  it('renders element names', () => {
    renderWithRouter(<TrialTimeline trialId="t1" showId="s1" />);
    expect(screen.getByText('Container')).toBeInTheDocument();
    expect(screen.getByText('Buried')).toBeInTheDocument();
  });

  it('renders progress fractions', () => {
    renderWithRouter(<TrialTimeline trialId="t1" showId="s1" />);
    expect(screen.getByText('2/2 ✓')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('auto-expands in-progress element showing levels', () => {
    renderWithRouter(<TrialTimeline trialId="t1" showId="s1" />);
    expect(screen.getByText('Novice')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
  });

  it('shows entry counts in expanded levels', () => {
    renderWithRouter(<TrialTimeline trialId="t1" showId="s1" />);
    expect(screen.getByText('10 entries')).toBeInTheDocument();
    expect(screen.getByText('8 entries')).toBeInTheDocument();
  });
});
