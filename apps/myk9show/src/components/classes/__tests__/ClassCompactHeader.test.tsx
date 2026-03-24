import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClassCompactHeader } from '../ClassCompactHeader';
import type { ClassData } from '../types/classTypes';
import type { Trial } from '@/components/trials/types/trial.types';

function makeClassData(overrides: Partial<ClassData> = {}): ClassData {
  return {
    id: 'cls-1',
    trialId: 'trial-1',
    trial: 'Trial 1',
    trialDate: '2026-03-21',
    trialNumber: '1',
    classOrder: '1',
    status: 'Scheduled',
    judge: 'Jane Smith',
    element: 'Container',
    level: 'Novice',
    entryFee: 30,
    maxEntries: 40,
    timeLimit1: '2:30',
    ...overrides,
  };
}

function makeTrial(overrides: Partial<Trial> = {}): Trial {
  return {
    id: 'trial-1',
    showId: 'show-1',
    showName: 'Spring Classic',
    trialDate: '2026-03-21',
    trialNumber: 'Saturday Trial 1',
    status: 'Scheduled',
    trialType: 'Standard',
    ...overrides,
  };
}

describe('ClassCompactHeader', () => {
  it('renders class name from element and level', () => {
    render(<ClassCompactHeader classData={makeClassData()} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Container Novice');
  });

  it('renders status badge with correct variant', () => {
    const { rerender } = render(
      <ClassCompactHeader classData={makeClassData({ status: 'In Progress' })} />
    );
    const inProgressBadge = screen.getByText('In Progress');
    expect(inProgressBadge).toBeInTheDocument();
    // Warning variant has orange styling
    expect(inProgressBadge.className).toMatch(/orange/);

    rerender(<ClassCompactHeader classData={makeClassData({ status: 'Completed' })} />);
    const completedBadge = screen.getByText('Completed');
    expect(completedBadge).toBeInTheDocument();
    // Success variant has green styling
    expect(completedBadge.className).toMatch(/green/);

    rerender(<ClassCompactHeader classData={makeClassData({ status: 'Scheduled' })} />);
    const scheduledBadge = screen.getByText('Scheduled');
    expect(scheduledBadge).toBeInTheDocument();
    // Default variant uses muted styling
    expect(scheduledBadge.className).toMatch(/muted/);
  });

  it('renders section label when provided', () => {
    render(<ClassCompactHeader classData={makeClassData({ section: 'A' })} />);
    expect(screen.getByText('Section A')).toBeInTheDocument();
  });

  it('renders metadata strip with all fields', () => {
    render(<ClassCompactHeader classData={makeClassData()} parentTrial={makeTrial()} />);

    expect(screen.getByText('Judge')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();

    expect(screen.getByText('Trial')).toBeInTheDocument();
    expect(screen.getByText('Saturday Trial 1')).toBeInTheDocument();

    expect(screen.getByText('Date')).toBeInTheDocument();
    // The date should be formatted via toLocaleDateString

    expect(screen.getByText('Entry Fee')).toBeInTheDocument();
    expect(screen.getByText('$30.00')).toBeInTheDocument();

    expect(screen.getByText('Max Entries')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();

    expect(screen.getByText('Time Limit')).toBeInTheDocument();
    expect(screen.getByText('2:30')).toBeInTheDocument();
  });

  it('handles missing optional fields gracefully', () => {
    const minimal: ClassData = {
      id: 'cls-2',
      trialId: 'trial-2',
      trial: 'Trial 2',
      trialDate: '2026-03-22',
      trialNumber: '2',
      classOrder: '2',
      status: 'Scheduled',
      judge: '',
    };

    // Should not crash
    const { container } = render(<ClassCompactHeader classData={minimal} />);
    expect(container).toBeTruthy();

    // Missing values should show a dash
    const dashValues = screen.getAllByText('\u2014');
    expect(dashValues.length).toBeGreaterThan(0);
  });

  it('renders actions slot when provided', () => {
    const actions = (
      <div>
        <button>Edit</button>
        <button>More</button>
      </div>
    );
    render(<ClassCompactHeader classData={makeClassData()} actions={actions} />);
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('More')).toBeInTheDocument();
  });

  it('does NOT render Enter Scores button', () => {
    render(<ClassCompactHeader classData={makeClassData()} />);
    expect(screen.queryByText('Enter Scores')).not.toBeInTheDocument();
  });

  it('renders officials in metadata strip when assigned', () => {
    render(
      <ClassCompactHeader
        classData={makeClassData({
          gateSteward: 'Alice Johnson',
          tableSteward: 'Bob Williams',
        })}
      />
    );
    expect(screen.getByText('Gate Steward')).toBeInTheDocument();
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.getByText('Table Steward')).toBeInTheDocument();
    expect(screen.getByText('Bob Williams')).toBeInTheDocument();
  });

  it('does not render steward fields when not assigned', () => {
    render(<ClassCompactHeader classData={makeClassData()} />);
    expect(screen.queryByText('Gate Steward')).not.toBeInTheDocument();
    expect(screen.queryByText('Table Steward')).not.toBeInTheDocument();
  });

  it('falls back to trial number when trialType is missing', () => {
    render(
      <ClassCompactHeader
        classData={makeClassData()}
        parentTrial={makeTrial({ trialType: undefined, trialNumber: '3' })}
      />
    );
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows dash for trial when no parentTrial is provided', () => {
    render(<ClassCompactHeader classData={makeClassData()} />);
    // The Trial metadata field should show a dash
    const trialLabel = screen.getByText('Trial');
    const trialValue = trialLabel.closest('[data-testid="metadata-item"]');
    expect(trialValue).toHaveTextContent('\u2014');
  });
});
