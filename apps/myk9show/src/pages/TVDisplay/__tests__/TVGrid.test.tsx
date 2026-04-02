import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { TVGrid } from '../TVGrid';
import type { TVClass } from '../types';

const makeClass = (id: string, name: string): TVClass => ({
  id,
  name,
  element: null,
  level: null,
  status: 'In Progress',
  judgeName: 'Smith',
  totalEntries: 10,
  scoredCount: 3,
  startTime: null,
  trialDate: null,
  trialNumber: null,
  entries: [],
});

describe('TVGrid', () => {
  it('renders all class cards in a grid', () => {
    const classes = [
      makeClass('1', 'Novice A'),
      makeClass('2', 'Open'),
      makeClass('3', 'Excellent'),
    ];
    render(<TVGrid classes={classes} />);
    expect(screen.getByText('Novice A')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Excellent')).toBeInTheDocument();
  });

  it('renders empty state when no classes', () => {
    render(<TVGrid classes={[]} />);
    expect(screen.getByText(/no classes currently in progress/i)).toBeInTheDocument();
  });

  it('highlights recently updated class', () => {
    const classes = [makeClass('1', 'Novice A')];
    render(<TVGrid classes={classes} highlightedClassId="1" />);
    expect(screen.getByText('Novice A')).toBeInTheDocument();
  });
});
