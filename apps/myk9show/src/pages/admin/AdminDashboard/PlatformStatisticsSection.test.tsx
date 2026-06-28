import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { PlatformStatisticsSection } from './PlatformStatisticsSection';

const baseProps = {
  totalUsers: 12,
  activeShows: 3,
  totalShows: 9,
  totalDogs: 25,
};

describe('PlatformStatisticsSection', () => {
  it('renders skeletons (not a "Loading..." string) while loading', () => {
    render(<PlatformStatisticsSection isLoading {...baseProps} />, {
      initialRoute: '/admin/dashboard',
    });
    // The loading-string regression: the literal value must never reach the DOM.
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    // Real metric values are also withheld until data is ready.
    expect(screen.queryByText('12')).not.toBeInTheDocument();
  });

  it('renders real metric values when not loading', () => {
    render(<PlatformStatisticsSection isLoading={false} {...baseProps} />, {
      initialRoute: '/admin/dashboard',
    });
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText(/9 total shows/)).toBeInTheDocument();
  });
});
