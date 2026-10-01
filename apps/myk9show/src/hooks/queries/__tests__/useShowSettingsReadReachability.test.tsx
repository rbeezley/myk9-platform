/**
 * MYK9-866: a settings READ that fails at the transport level (postgrest status 0)
 * must feed the server-reachability flag, exactly as a failed write does. Server-side
 * errors (RLS, 4xx, 5xx) reached the server and must not.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ResultsBulkBar } from '@/pages/secretary/ResultsControlPage/ResultsBulkBar';
import {
  useShowSettings,
  useTrialOverrides,
  useClassOverrides,
} from '@/hooks/queries/useShowSettingsDatabase';
import { resetServerReachabilityForTests, useServerReachable } from '@/lib/serverReachability';

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'from') return mockFrom;
        return undefined;
      },
    }
  ),
}));

vi.mock('@/hooks/mutations/useShowSettingsMutations', () => ({
  useBulkUpdateClassOverrides: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/mutations/useReleaseResults', () => ({
  useReleaseResults: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/mutations/useUnreleaseResults', () => ({
  useUnreleaseResults: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isOnline: true }) }));

function chainableQuery(resolved: Record<string, unknown>) {
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(resolved);
      return vi.fn(() => new Proxy({}, handler));
    },
  };
  return new Proxy({}, handler);
}

const transportFailure = {
  data: null,
  error: { message: 'TypeError: Failed to fetch', code: '' },
  status: 0,
};
const rlsFailure = { data: null, error: { message: 'denied', code: '42501' }, status: 403 };
const serverFailure = { data: null, error: { message: 'boom', code: 'XX000' }, status: 500 };

function Reachability() {
  return <span data-testid="reachable">{String(useServerReachable())}</span>;
}

function SettingsReads({ which }: { which: 'show' | 'trials' | 'classes' }) {
  useShowSettings(which === 'show' ? 'show-1' : null);
  useTrialOverrides(which === 'trials' ? 'show-1' : null);
  useClassOverrides(which === 'classes' ? 'show-1' : null);
  return <Reachability />;
}

describe('settings reads feed server reachability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetServerReachabilityForTests();
  });

  it.each(['show', 'trials', 'classes'] as const)(
    'a transport-level %s read marks the server unreachable',
    async which => {
      mockFrom.mockReturnValue(chainableQuery(transportFailure));
      render(<SettingsReads which={which} />);
      await waitFor(() => expect(screen.getByTestId('reachable')).toHaveTextContent('false'));
    }
  );

  it.each([
    ['RLS 42501', rlsFailure],
    ['HTTP 500', serverFailure],
  ])('a %s read does not mark the server unreachable', async (_label, failure) => {
    mockFrom.mockReturnValue(chainableQuery(failure));
    render(<SettingsReads which="show" />);
    await waitFor(() => expect(mockFrom).toHaveBeenCalled());
    // Let the rejected query settle, then confirm the flag never flipped.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.getByTestId('reachable')).toHaveTextContent('true');
  });

  it('shows "Needs a connection" on a control after a settings read fails, with no write', async () => {
    mockFrom.mockReturnValue(chainableQuery(transportFailure));
    render(
      <>
        <SettingsReads which="show" />
        <ResultsBulkBar
          showId="show-1"
          selectedClasses={new Set(['a'])}
          allClassIds={['a']}
          onSelectAll={vi.fn()}
          onClearSelection={vi.fn()}
          onDeselectClasses={vi.fn()}
          hasManualReleaseClasses
          hasReleasedClasses={false}
        />
      </>
    );
    expect(await screen.findByText('Needs a connection')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
