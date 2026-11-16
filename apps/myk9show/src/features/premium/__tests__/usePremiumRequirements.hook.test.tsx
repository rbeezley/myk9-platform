import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import type { Show } from '@/types/show-types';
import { usePremiumRequirements } from '../usePremiumRequirements';

const harness = vi.hoisted(() => ({
  officials: { data: undefined as unknown, isLoading: false },
  committee: null as string[] | null,
}));

vi.mock('@/hooks/queries/useShowOfficials', () => ({
  useShowOfficials: () => harness.officials,
}));
vi.mock('@/services/database/club-memberships/committee', () => ({
  fetchShowCommittee: async () => harness.committee,
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
    </div>
  );
}

beforeEach(() => {
  harness.officials = {
    data: { secretaries: [], chairmen: [], stewards: [] },
    isLoading: false,
  };
  harness.committee = ['A', 'B', 'C', 'D', 'E'];
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
});
