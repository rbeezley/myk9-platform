import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ClassCard } from '@/components/shows/tabs/ClassCard';

vi.mock('@myk9/core', () => ({
  getClassStatusDisplay: (status: string) => {
    if (status === 'In Progress')
      return {
        label: 'In Progress',
        bgClass: 'bg-blue-100',
        textClass: 'text-blue-800',
        darkBgClass: '',
        darkTextClass: '',
      };
    return {
      label: 'Scheduled',
      bgClass: 'bg-gray-100',
      textClass: 'text-gray-800',
      darkBgClass: '',
      darkTextClass: '',
    };
  },
}));

const baseClass = {
  id: 'c1',
  name: 'Novice Containers',
  element: 'Containers',
  level: 'Novice',
  section: '',
  judgeName: 'Jane Smith',
  trialId: 't1',
  time: '9:00 AM',
  ring: 1,
  status: 'Scheduled' as const,
  entryCount: 28,
  userHasEntry: false,
};

describe('ClassCard', () => {
  it('renders element and level as title', () => {
    render(<ClassCard classInfo={baseClass} />);
    expect(screen.getByText('Containers')).toBeInTheDocument();
    expect(screen.getByText('Novice')).toBeInTheDocument();
  });

  it('renders judge name', () => {
    render(<ClassCard classInfo={baseClass} />);
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<ClassCard classInfo={baseClass} />);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
  });

  it('renders entry count', () => {
    render(<ClassCard classInfo={baseClass} />);
    expect(screen.getByText('28')).toBeInTheDocument();
    expect(screen.getByText('entries')).toBeInTheDocument();
  });

  it('renders time and ring', () => {
    render(<ClassCard classInfo={baseClass} />);
    expect(screen.getByText('9:00 AM')).toBeInTheDocument();
    expect(screen.getByText(/Ring 1/)).toBeInTheDocument();
  });

  it('hides ring when hideRing is true', () => {
    render(<ClassCard classInfo={baseClass} hideRing />);
    expect(screen.queryByText(/Ring/)).not.toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<ClassCard classInfo={baseClass} onClick={onClick} />);
    fireEvent.click(screen.getByText('Containers'));
    expect(onClick).toHaveBeenCalled();
  });

  it('shows progress bar for in-progress class with live data', () => {
    const liveClass = {
      ...baseClass,
      status: 'In Progress' as const,
    };
    render(
      <ClassCard
        classInfo={liveClass}
        liveData={{
          totalEntries: 28,
          completedEntries: 12,
          inRingArmband: '205',
          nextArmbands: ['206', '207'],
        }}
      />,
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('#205')).toBeInTheDocument();
    expect(screen.getByText('#206')).toBeInTheDocument();
  });

  it('does not show live data for scheduled class even if provided', () => {
    render(
      <ClassCard
        classInfo={baseClass}
        liveData={{
          totalEntries: 28,
          completedEntries: 0,
          inRingArmband: '100',
          nextArmbands: [],
        }}
      />,
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('#100')).not.toBeInTheDocument();
  });
});
