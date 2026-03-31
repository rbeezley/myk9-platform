import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TrialOverrides } from '../ResultsControlPage/TrialOverrides';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { TrialOverrideEntry } from '@/hooks/queries/useShowSettingsDatabase';

const mockTrialMutate = vi.fn();
const mockResetMutate = vi.fn();
vi.mock('@/hooks/mutations/useShowSettingsMutations', () => ({
  useUpdateTrialOverride: () => ({ mutate: mockTrialMutate, isPending: false }),
  useResetOverride: () => ({ mutate: mockResetMutate, isPending: false }),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const trials: SyncableTrial[] = [
  {
    id: 'trial-1',
    name: 'Trial A',
    showId: 'show-1',
    _version: 1,
    _lastModified: new Date(),
    _lastModifiedBy: '',
    _syncStatus: 'synced',
  } as SyncableTrial,
  {
    id: 'trial-2',
    name: 'Trial B',
    showId: 'show-1',
    _version: 1,
    _lastModified: new Date(),
    _lastModifiedBy: '',
    _syncStatus: 'synced',
  } as SyncableTrial,
];

function renderTrialOverrides(overrides: TrialOverrideEntry[] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TrialOverrides showId="show-1" trials={trials} trialOverrides={overrides} />
    </QueryClientProvider>
  );
}

describe('TrialOverrides', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders all trial names', () => {
    renderTrialOverrides();
    expect(screen.getByText('Trial A')).toBeInTheDocument();
    expect(screen.getByText('Trial B')).toBeInTheDocument();
  });

  it('shows "Inheriting from show" when no override', () => {
    renderTrialOverrides();
    const labels = screen.getAllByText(/inheriting from show/i);
    expect(labels).toHaveLength(2);
  });

  it('shows reset button when override exists', () => {
    const overrides: TrialOverrideEntry[] = [
      { trialId: 'trial-1', override: { preset: 'open' }, selfCheckinEnabled: null },
    ];
    renderTrialOverrides(overrides);
    expect(screen.getByTitle('Reset to show defaults')).toBeInTheDocument();
  });

  it('returns null when no trials', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <TrialOverrides showId="show-1" trials={[]} trialOverrides={[]} />
      </QueryClientProvider>
    );
    expect(container.innerHTML).toBe('');
  });
});
