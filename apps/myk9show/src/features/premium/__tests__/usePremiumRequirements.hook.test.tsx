import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import type { Show } from '@/types/show-types';
import { usePremiumRequirements } from '../usePremiumRequirements';

const harness = vi.hoisted(() => ({
  officials: { data: undefined as unknown, isLoading: false },
  committee: null as string[] | null,
  own: [] as Array<{ id: string }>,
}));

vi.mock('@/hooks/queries/useShowOfficials', () => ({
  useShowOfficials: () => harness.officials,
}));
vi.mock('@/services/database/club-memberships/committee', () => ({
  fetchShowCommittee: async () => harness.committee,
  getCommittee: async () => harness.own,
}));

const show = (organization: string) =>
  ({
    id: 'show-1',
    organization,
    clubId: 'club-1',
    clubName: '',
    location: '',
    startDate: '2026-06-01',
    entryOpenDate: '',
    entryCloseDate: '',
    preEntryFee: '',
  }) as unknown as Show;

function Probe({ org }: { org: string }) {
  const { items, registry } = usePremiumRequirements(show(org), [], [], [], true);
  return (
    <div>
      <span data-testid="registry">{registry ?? 'none'}</span>
      <span data-testid="count">{items.length}</span>
      <span data-testid="committee-href">
        {items.find(i => i.id === 'committee')?.href ?? 'none'}
      </span>
    </div>
  );
}

beforeEach(() => {
  harness.officials = {
    data: { secretaries: [], chairmen: [], stewards: [] },
    isLoading: false,
  };
  harness.committee = ['A', 'B', 'C', 'D', 'E'];
  harness.own = [];
});

describe('usePremiumRequirements (MYK9-2053)', () => {
  it('names the show organization registry when there is no trial yet', async () => {
    render(<Probe org="AKC" />);
    await waitFor(() => expect(Number(screen.getByTestId('count').textContent)).toBeGreaterThan(0));
    expect(screen.getByTestId('registry')).toHaveTextContent('AKC');
  });

  it('lists nothing for an organization with no registry rules, instead of defaulting to AKC', async () => {
    render(<Probe org="NACSW" />);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.getByTestId('registry')).toHaveTextContent('none');
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('holds the list while the officials are still loading', async () => {
    harness.officials = { data: undefined, isLoading: true };
    render(<Probe org="AKC" />);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('links a short committee to the show when the show has its own list', async () => {
    harness.committee = ['A'];
    harness.own = [{ id: 'm1' }];
    render(<Probe org="AKC" />);
    await waitFor(() =>
      expect(screen.getByTestId('committee-href')).toHaveTextContent(
        '/shows/show-1?edit=true&editTab=personnel'
      )
    );
  });

  it('links a short committee to the club when the show uses the club list', async () => {
    harness.committee = ['A'];
    render(<Probe org="AKC" />);
    await waitFor(() =>
      expect(screen.getByTestId('committee-href')).toHaveTextContent('/clubs/club-1?tab=members')
    );
  });
});
