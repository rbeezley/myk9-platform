import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';

const mocks = vi.hoisted(() => ({
  officials: undefined as unknown,
}));

vi.mock('@/hooks/queries/useShowOfficials', () => ({
  useShowOfficials: () => ({ data: mocks.officials }),
}));

import { RingsideShowInfo } from './RingsideShowInfo';

function renderInfo(isOnline = true) {
  return render(<RingsideShowInfo showId="show-1" location={null} isOnline={isOnline} />);
}

describe('RingsideShowInfo contacts', () => {
  beforeEach(() => {
    mocks.officials = undefined;
  });

  it('shows the no-contact line when officials are loaded and none exist', () => {
    mocks.officials = { secretaries: [], chairmen: [], stewards: [] };
    renderInfo();

    expect(screen.getByText('No show contact listed')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /secretary|chairman/i })).not.toBeInTheDocument();
  });

  it('shows the no-contact line when officials have no email', () => {
    mocks.officials = {
      secretaries: [{ personId: 's1', firstName: 'Sam', lastName: 'Secretary', email: null }],
      chairmen: [{ personId: 'c1', firstName: 'Cher', lastName: 'Chair', email: '' }],
      stewards: [],
    };
    renderInfo();

    expect(screen.getByText('No show contact listed')).toBeInTheDocument();
    expect(screen.queryByText('Sam Secretary')).not.toBeInTheDocument();
    expect(screen.queryByText('Cher Chair')).not.toBeInTheDocument();
  });

  it('renders mailto links for officials with email and no no-contact line', () => {
    mocks.officials = {
      secretaries: [
        { personId: 's1', firstName: 'Sam', lastName: 'Secretary', email: 'sam@example.com' },
      ],
      chairmen: [{ personId: 'c1', firstName: 'Cher', lastName: 'Chair', email: null }],
      stewards: [],
    };
    renderInfo();

    const link = screen.getByRole('link', { name: /Sam Secretary/ });
    expect(link).toHaveAttribute('href', 'mailto:sam@example.com');
    expect(screen.queryByText('Cher Chair')).not.toBeInTheDocument();
    expect(screen.queryByText('No show contact listed')).not.toBeInTheDocument();
  });

  it('shows nothing while officials are still loading', () => {
    mocks.officials = undefined;
    renderInfo();

    expect(screen.queryByText('No show contact listed')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByTestId('ringside-show-info')).toBeInTheDocument();
  });

  it('offline with officials loaded and no email shows the no-contact line, not the connection notice', () => {
    mocks.officials = { secretaries: [], chairmen: [], stewards: [] };
    renderInfo(false);

    expect(screen.getByText('No show contact listed')).toBeInTheDocument();
    expect(
      screen.queryByText('Secretary and chairman contacts need a connection.')
    ).not.toBeInTheDocument();
  });

  it('offline with no officials cached keeps the connection notice', () => {
    mocks.officials = undefined;
    renderInfo(false);

    expect(
      screen.getByText('Secretary and chairman contacts need a connection.')
    ).toBeInTheDocument();
    expect(screen.queryByText('No show contact listed')).not.toBeInTheDocument();
  });
});
