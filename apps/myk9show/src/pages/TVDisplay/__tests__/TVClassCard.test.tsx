import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { TVClassCard } from '../TVClassCard';
import type { TVClass } from '../types';

const mockClass: TVClass = {
  id: 'class-1',
  name: 'Novice A',
  element: 'Container',
  level: 'Novice',
  status: 'In Progress',
  judgeName: 'Smith',
  totalEntries: 28,
  scoredCount: 12,
  startTime: '09:00',
  trialDate: '2026-04-01',
  trialNumber: 1,
  entries: [
    {
      id: 'e1',
      armband: '42',
      handler: 'J. Martinez',
      runOrder: 4,
      isInRing: true,
      isScored: false,
      dog: { name: 'Luna Star', callName: 'Luna', breed: 'Labrador', imageUrl: null },
    },
    {
      id: 'e2',
      armband: '18',
      handler: 'S. Johnson',
      runOrder: 5,
      isInRing: false,
      isScored: false,
      dog: { name: 'Rex', callName: 'Rex', breed: 'GSD', imageUrl: null },
    },
    {
      id: 'e3',
      armband: '07',
      handler: 'T. Williams',
      runOrder: 6,
      isInRing: false,
      isScored: false,
      dog: { name: 'Bella', callName: 'Bella', breed: 'Golden', imageUrl: null },
    },
  ],
};

describe('TVClassCard', () => {
  it('renders class name and judge', () => {
    render(<TVClassCard tvClass={mockClass} />);
    expect(screen.getByText('Novice A')).toBeInTheDocument();
    expect(screen.getByText(/Smith/)).toBeInTheDocument();
  });

  it('renders status badge "IN PROGRESS"', () => {
    render(<TVClassCard tvClass={mockClass} />);
    expect(screen.getByText('IN PROGRESS')).toBeInTheDocument();
  });

  it('renders progress count "12 / 28"', () => {
    render(<TVClassCard tvClass={mockClass} />);
    expect(screen.getByText('12 / 28')).toBeInTheDocument();
  });

  it('highlights in-ring dog with "IN RING" label and "#42 Luna" text', () => {
    render(<TVClassCard tvClass={mockClass} />);
    expect(screen.getByText('IN RING')).toBeInTheDocument();
    expect(screen.getByText(/#42 Luna/)).toBeInTheDocument();
  });

  it('shows "NEXT" label on first pending entry', () => {
    render(<TVClassCard tvClass={mockClass} />);
    expect(screen.getByText('NEXT')).toBeInTheDocument();
  });

  it('renders "STARTS 10:30" for start_time status', () => {
    const startTimeClass: TVClass = {
      ...mockClass,
      status: 'start_time',
      startTime: '10:30',
      entries: [],
    };
    render(<TVClassCard tvClass={startTimeClass} />);
    expect(screen.getByText('STARTS 10:30')).toBeInTheDocument();
  });

  it('applies animate-pulse-border class when highlighted prop is true', () => {
    const { container } = render(<TVClassCard tvClass={mockClass} highlighted />);
    expect(container.firstChild).toHaveClass('animate-pulse-border');
  });
});
