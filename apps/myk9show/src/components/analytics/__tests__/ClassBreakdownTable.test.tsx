import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { ClassBreakdownTable } from '../ClassBreakdownTable';
import type { ClassBreakdownEntry } from '../analytics-utils';

function makeClassEntry(overrides: Partial<ClassBreakdownEntry> = {}): ClassBreakdownEntry {
  return {
    classId: 'c1',
    className: 'Containers Novice',
    classElement: 'Containers',
    classLevel: 'Novice',
    trialDate: '2026-04-01',
    trialNumber: '1',
    entryCount: 5,
    scoredCount: 4,
    qualifiedCount: 3,
    qualificationRate: 0.75,
    bestTime: 30,
    avgTime: 42.5,
    ...overrides,
  };
}

describe('ClassBreakdownTable', () => {
  it('returns null when classes array is empty', () => {
    const { container } = render(<ClassBreakdownTable classes={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a row for each class', () => {
    const classes = [
      makeClassEntry({ classId: 'c1', className: 'Containers Novice' }),
      makeClassEntry({ classId: 'c2', className: 'Interiors Excellent', trialNumber: '2' }),
    ];

    render(<ClassBreakdownTable classes={classes} />);

    expect(screen.getByText('Class Performance')).toBeInTheDocument();
    expect(screen.getByText('Containers Novice')).toBeInTheDocument();
    expect(screen.getByText('Interiors Excellent')).toBeInTheDocument();
  });

  it('displays trial date and trial number', () => {
    const classes = [makeClassEntry({ trialDate: '2026-04-01', trialNumber: '2' })];

    render(<ClassBreakdownTable classes={classes} />);

    expect(screen.getByText('Apr 1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
  });

  it('formats Q rate as percentage', () => {
    const classes = [makeClassEntry({ qualificationRate: 0.75 })];

    render(<ClassBreakdownTable classes={classes} />);

    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('shows dash for null times', () => {
    const classes = [makeClassEntry({ bestTime: null, avgTime: null })];

    render(<ClassBreakdownTable classes={classes} />);

    const dashes = screen.getAllByText('\u2014');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });
});
