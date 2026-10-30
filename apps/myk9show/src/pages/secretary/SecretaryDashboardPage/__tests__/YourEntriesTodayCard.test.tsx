import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { YourEntriesTodayCard } from '../YourEntriesTodayCard';
import { useEntriesToday } from '@/hooks/useEntriesToday';

vi.mock('@/hooks/useEntriesToday');

const mockUseEntriesToday = useEntriesToday as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('YourEntriesTodayCard', () => {
  it('renders nothing without an entry in a show happening today', () => {
    mockUseEntriesToday.mockReturnValue({ lines: [], showNames: new Map() });
    render(<YourEntriesTodayCard />);
    expect(screen.queryByText('Your entries today')).not.toBeInTheDocument();
  });

  it('lists the dog, class and status, linking to the entries page with no check-in control', () => {
    mockUseEntriesToday.mockReturnValue({
      lines: [
        {
          entryId: 'e1',
          showId: 's1',
          dogCallName: 'Scout',
          classLabel: 'Container Novice A',
          statusLabel: 'Check in',
        },
      ],
      showNames: new Map([['s1', 'Fall Classic']]),
    });
    render(<YourEntriesTodayCard />);

    expect(screen.getByText('Your entries today')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Scout, Container Novice A/ });
    expect(link).toHaveAttribute('href', '/exhibitor/entries');
    expect(link).toHaveTextContent('Check in');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
