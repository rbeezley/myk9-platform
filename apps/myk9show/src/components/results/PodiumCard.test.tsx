import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { PodiumCard } from './PodiumCard';
import type { Placement } from '@/hooks/queries/useShowResults';

const placements: Placement[] = [
  { placement: 1, handlerName: 'Alice Smith', dogName: 'Rex', breed: 'Labrador', armband: '101' },
  { placement: 2, handlerName: 'Bob Jones', dogName: 'Max', breed: 'GSD', armband: '102' },
  { placement: 3, handlerName: 'Carol Lee', dogName: 'Bella', breed: 'Beagle', armband: null },
];

describe('PodiumCard', () => {
  it('renders class name in header', () => {
    render(<PodiumCard className="Container Novice A" placements={placements} />);
    expect(screen.getByText('Container Novice A')).toBeInTheDocument();
  });

  it('renders all placements', () => {
    render(<PodiumCard className="Test Class" placements={placements} />);
    expect(screen.getByText('1st')).toBeInTheDocument();
    expect(screen.getByText('2nd')).toBeInTheDocument();
    expect(screen.getByText('3rd')).toBeInTheDocument();
  });

  it('renders handler names', () => {
    render(<PodiumCard className="Test Class" placements={placements} />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.getByText('Carol Lee')).toBeInTheDocument();
  });

  it('renders dog names in quotes', () => {
    render(<PodiumCard className="Test Class" placements={placements} />);
    // Uses &ldquo; and &rdquo; — rendered as typographic quotes
    expect(screen.getByText(/Rex/)).toBeInTheDocument();
    expect(screen.getByText(/Max/)).toBeInTheDocument();
  });

  it('renders armband when present', () => {
    render(<PodiumCard className="Test Class" placements={placements} />);
    expect(screen.getByText('#101')).toBeInTheDocument();
    expect(screen.getByText('#102')).toBeInTheDocument();
  });

  it('does not render armband when null', () => {
    render(<PodiumCard className="Test Class" placements={placements} />);
    expect(screen.queryByText('#null')).not.toBeInTheDocument();
  });

  it('sorts placements by position', () => {
    const reversed: Placement[] = [...placements].reverse();
    render(<PodiumCard className="Test Class" placements={reversed} />);
    const badges = screen.getAllByText(/1st|2nd|3rd/);
    expect(badges[0]).toHaveTextContent('1st');
    expect(badges[1]).toHaveTextContent('2nd');
    expect(badges[2]).toHaveTextContent('3rd');
  });
});
