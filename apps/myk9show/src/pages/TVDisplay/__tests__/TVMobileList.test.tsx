import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { TVMobileList } from '../TVMobileList';
import type { TVClass, TVCompletedClass } from '../types';

const mockClass: TVClass = {
  id: 'c1',
  name: 'Novice A',
  element: null,
  level: null,
  status: 'In Progress',
  judgeName: 'Smith',
  totalEntries: 10,
  scoredCount: 3,
  startTime: null,
  trialDate: null,
  trialNumber: null,
  entries: [
    {
      id: 'e1',
      armband: '42',
      handler: 'J. Martinez',
      runOrder: 1,
      isInRing: true,
      isScored: false,
      dog: { name: 'Luna', callName: 'Luna', imageUrl: null },
    },
  ],
};

const mockCompleted: TVCompletedClass = {
  id: 'c2',
  name: 'Advanced',
  element: null,
  level: null,
  judgeName: 'Lee',
  totalEntries: 15,
  qualifiedCount: 12,
  fastestTime: 30.0,
  placements: [
    {
      placement: 1,
      armband: '10',
      handler: 'A. Smith',
      searchTime: 30.0,
      totalScore: null,
      dog: { name: 'Scout', callName: 'Scout', imageUrl: null },
    },
  ],
};

describe('TVMobileList', () => {
  it('renders active classes', () => {
    render(<TVMobileList classes={[mockClass]} completedClasses={[]} />);
    expect(screen.getByText('Novice A')).toBeInTheDocument();
    expect(screen.getByText('IN RING')).toBeInTheDocument();
  });

  it('renders completed classes with inline results', () => {
    render(<TVMobileList classes={[]} completedClasses={[mockCompleted]} />);
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByText(/Scout/)).toBeInTheDocument();
  });

  it('shows active classes before completed classes', () => {
    const { container } = render(
      <TVMobileList classes={[mockClass]} completedClasses={[mockCompleted]} />
    );
    const allText = container.textContent ?? '';
    expect(allText.indexOf('Novice A')).toBeLessThan(allText.indexOf('Advanced'));
  });

  it('shows empty state when no classes', () => {
    render(
      <TVMobileList
        classes={[]}
        completedClasses={[]}
        showName="Spring Trial 2026"
        showId="show-1"
      />
    );
    expect(screen.getByText(/no classes currently in progress/i)).toBeInTheDocument();
    expect(screen.getByText(/Spring Trial 2026/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view show details/i })).toHaveAttribute(
      'href',
      '/shows/show-1'
    );
  });

  it('does not show the empty state when only completed classes remain', () => {
    render(
      <TVMobileList classes={[]} completedClasses={[mockCompleted]} showName="Spring Trial 2026" />
    );
    expect(screen.queryByText(/no classes currently in progress/i)).not.toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
  });

  it('distinguishes a refresh failure from no active classes', () => {
    render(
      <TVMobileList
        classes={[]}
        completedClasses={[]}
        showName="Spring Trial 2026"
        error={new Error('network unavailable')}
      />
    );
    expect(screen.getByText('TV board data unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/no classes currently in progress/i)).not.toBeInTheDocument();
  });
});
