import { render } from '@/test/utils/testUtils';
import { screen, act } from '@testing-library/react';
import { TVPodiumOverlay } from '../TVPodiumOverlay';
import type { TVCompletedClass } from '../types';

const mockCompleted: TVCompletedClass = {
  id: 'class-1',
  name: 'Novice A',
  element: 'Container',
  level: 'Novice',
  judgeName: 'Smith',
  totalEntries: 28,
  qualifiedCount: 22,
  fastestTime: 35.1,
  placements: [
    {
      placement: 1,
      armband: '42',
      handler: 'J. Martinez',
      searchTime: 35.1,
      totalScore: null,
      dog: { name: 'Luna', callName: 'Luna', breed: 'Lab', imageUrl: null },
    },
    {
      placement: 2,
      armband: '18',
      handler: 'S. Johnson',
      searchTime: 38.2,
      totalScore: null,
      dog: { name: 'Rex', callName: 'Rex', breed: 'GSD', imageUrl: null },
    },
    {
      placement: 3,
      armband: '07',
      handler: 'T. Williams',
      searchTime: 41.7,
      totalScore: null,
      dog: { name: 'Bella', callName: 'Bella', breed: 'Golden', imageUrl: null },
    },
    {
      placement: 4,
      armband: '31',
      handler: 'R. Chen',
      searchTime: 44.0,
      totalScore: null,
      dog: { name: 'Max', callName: 'Max', breed: 'Beagle', imageUrl: null },
    },
  ],
};

describe('TVPodiumOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders class name and placements', () => {
    render(<TVPodiumOverlay queue={[mockCompleted]} onComplete={vi.fn()} />);
    expect(screen.getByText('Novice A')).toBeInTheDocument();
    expect(screen.getByText('1st Place')).toBeInTheDocument();
    expect(screen.getByText(/#42 Luna/)).toBeInTheDocument();
  });

  it('renders class summary stats', () => {
    render(<TVPodiumOverlay queue={[mockCompleted]} onComplete={vi.fn()} />);
    expect(screen.getByText(/28 entries/)).toBeInTheDocument();
    expect(screen.getByText(/22 qualified/)).toBeInTheDocument();
    expect(screen.getByText(/35\.1s/)).toBeInTheDocument();
  });

  it('calls onComplete after 20 seconds', () => {
    const onComplete = vi.fn();
    render(<TVPodiumOverlay queue={[mockCompleted]} onComplete={onComplete} />);
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(onComplete).toHaveBeenCalledWith('class-1');
  });

  it('renders nothing when queue is empty', () => {
    const { container } = render(<TVPodiumOverlay queue={[]} onComplete={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
