/**
 * IA-1 (MYK9-1296): Wi-Fi, the per-show withdrawal policy and refund-all live in the Edit show
 * details panel, keyed on the show the route opened. They used to exist only on the unlinked
 * /secretary/settings page, which read the store's `selectedShowId`.
 */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowDetailsPanel } from '../ShowDetailsPanel';
import { ArmbandLabelCell } from '@/components/reports/labels/ArmbandLabelCell';
import { DEFAULT_CONTENT_CONFIG } from '@/lib/labels/armbandLabelTypes';
import { useArmbandLabelData } from '@/hooks/queries/useArmbandLabelData';
import type { Show } from '@/types/show-types';

const ROUTE_SHOW_ID = 'route-show-7';

const db = vi.hoisted(() => ({
  row: {
    status: 'published',
    venue_wifi_network: null as string | null,
    venue_wifi_password: null as string | null,
    withdrawal_cutoff_date: null,
    withdrawal_retention_type: null,
    withdrawal_retention_value: null,
    withdrawal_policy_notes: null,
  } as Record<string, unknown>,
  reads: [] as string[],
  failWifi: false,
  entries: [] as Record<string, unknown>[],
  updates: [] as { table: string; id: string; values: Record<string, unknown> }[],
}));

function fakeFrom(table: string) {
  return {
    select: (cols?: string) => {
      const chain: Record<string, unknown> = {};
      for (const method of ['is', 'not', 'filter']) chain[method] = () => chain;
      chain.eq = (_col: string, id: string) => {
        // Column list included, so a card's own read can be told from its neighbours'.
        db.reads.push(`${table}:${(cols ?? '').split(',')[0]?.trim()}:${id}`);
        const isWifi = (cols ?? '').includes('venue_wifi');
        const result =
          isWifi && db.failWifi
            ? Promise.resolve({ data: null, error: new Error('offline'), count: null })
            : Promise.resolve({
                data: table === 'entries' ? db.entries : { ...db.row },
                error: null,
                count: 0,
              });
        return Object.assign(chain, {
          single: () => result,
          then: result.then.bind(result),
        });
      };
      return chain;
    },
    update: (values: Record<string, unknown>) => ({
      eq: (_col: string, id: string) => {
        db.updates.push({ table, id, values });
        Object.assign(db.row, values);
        return Promise.resolve({ error: null });
      },
    }),
  };
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: fakeFrom,
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));
vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: fakeFrom } }));
vi.mock('@/services/database/entries/serverHeldFlags', () => ({
  loadServerHeldEntryIds: async () => new Set<string>(),
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { getEntriesByShow: async () => [] },
}));
vi.mock('@/components/shows/overview/QuickInfoCards', () => ({ QuickInfoCards: () => null }));
vi.mock('@/features/premium/PremiumDownloadCard', () => ({ PremiumDownloadCard: () => null }));
vi.mock('@/features/premium/LandingPageCard', () => ({ LandingPageCard: () => null }));
vi.mock('@/components/shows/overview/AboutThisShowCard', () => ({ AboutThisShowCard: () => null }));
// The store's selection must never be what the cards key on.
const storeHarness = vi.hoisted(() => ({
  updateShow: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({
    selectedShowId: 'store-show-OTHER',
    shows: [
      { id: 'route-show-7', name: 'Route Show', location: '1 Main St', latitude: null },
      { id: 'store-show-OTHER', name: 'Other', location: '2 Side St', latitude: null },
    ],
    updateShow: storeHarness.updateShow,
  }),
}));
vi.mock('@/components/common/LazyComponents', () => ({
  VenuePinMap: ({ onChange }: { onChange: (v: { lat: number; lng: number }) => void }) => (
    <button type="button" onClick={() => onChange({ lat: 41.5, lng: -93.6 })}>
      simulate-pin-drag
    </button>
  ),
}));

const show = { id: ROUTE_SHOW_ID, name: 'Route Show', status: 'published' } as unknown as Show;

function renderPanel(props: { canManageShow?: boolean; open?: boolean } = {}) {
  return render(
    <ShowDetailsPanel
      show={show}
      canManageShow={props.canManageShow ?? true}
      entryCount={0}
      open={props.open ?? true}
      showPublishing={false}
    />
  );
}

beforeEach(() => {
  db.reads.length = 0;
  db.updates.length = 0;
  db.row.venue_wifi_network = null;
  db.row.venue_wifi_password = null;
  db.failWifi = false;
  db.entries = [];
});

describe('ShowDetailsPanel settings cards (IA-1)', () => {
  it('renders the Wi-Fi card on the route show', async () => {
    renderPanel();
    expect(await screen.findByText('Venue WiFi')).toBeInTheDocument();
    expect(db.reads).toContain(`shows:venue_wifi_network:${ROUTE_SHOW_ID}`);
    expect(db.reads.some(read => read.includes('store-show-OTHER'))).toBe(false);
  });

  it('renders the per-show withdrawal policy card and writes to the route show', async () => {
    renderPanel();
    await waitFor(() => screen.getByLabelText('Amount kept (USD)'));
    fireEvent.change(screen.getByLabelText('Amount kept (USD)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));
    await waitFor(() =>
      expect(db.updates).toContainEqual(
        expect.objectContaining({
          table: 'shows',
          id: ROUTE_SHOW_ID,
          values: expect.objectContaining({ withdrawal_retention_value: 1000 }),
        })
      )
    );
  });

  it('renders the venue map pin card and saves the pin to the route show', async () => {
    renderPanel();
    expect(await screen.findByText('Venue Map Pin')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'simulate-pin-drag' }));
    fireEvent.click(screen.getByRole('button', { name: /save pin/i }));
    await waitFor(() =>
      expect(storeHarness.updateShow).toHaveBeenCalledWith(ROUTE_SHOW_ID, {
        latitude: 41.5,
        longitude: -93.6,
      })
    );
  });

  it('refund-all reads the status of the route show and nothing about the store show', async () => {
    renderPanel();
    expect(await screen.findByText('Refund all entries')).toBeInTheDocument();
    // `status` is the refund-all card's own read; the other cards select other columns.
    await waitFor(() => expect(db.reads).toContain(`shows:status:${ROUTE_SHOW_ID}`));
    expect(db.reads.some(read => read.includes('store-show-OTHER'))).toBe(false);
  });

  it('shows a loading state, not the inputs, until the saved Wi-Fi has loaded', () => {
    renderPanel();
    expect(screen.getByLabelText('Loading venue WiFi')).toBeInTheDocument();
    expect(screen.queryByLabelText('Network Name')).not.toBeInTheDocument();
  });

  it('shows Try again, and no inputs, when the Wi-Fi read fails; Try again refetches', async () => {
    db.failWifi = true;
    renderPanel();
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.queryByLabelText('Network Name')).not.toBeInTheDocument();
    const readsBefore = db.reads.filter(read => read.startsWith('shows:venue_wifi')).length;

    db.failWifi = false;
    db.row.venue_wifi_network = 'SavedNet';
    fireEvent.click(retry);

    expect(await screen.findByLabelText('Network Name')).toHaveValue('SavedNet');
    expect(db.reads.filter(read => read.startsWith('shows:venue_wifi')).length).toBe(
      readsBefore + 1
    );
  });

  it('shows none of the cards to a viewer who cannot manage the show', () => {
    renderPanel({ canManageShow: false });
    expect(screen.queryByText('Venue WiFi')).not.toBeInTheDocument();
    expect(screen.queryByText('Venue Map Pin')).not.toBeInTheDocument();
    expect(screen.queryByText('Refund all entries')).not.toBeInTheDocument();
  });

  it('does not mount the cards while the panel is closed', () => {
    renderPanel({ open: false });
    expect(screen.queryByTestId('show-settings-cards')).not.toBeInTheDocument();
    expect(db.reads).toEqual([]);
  });

  it('the Wi-Fi saved in the panel is what the armband labels print, via useArmbandLabelData', async () => {
    db.entries = [
      {
        id: 'e1',
        dog_id: 'd1',
        armband: 101,
        dog: { call_name: 'Storm', owner: null },
        class: null,
      },
    ];
    // The production label path: useArmbandLabelData -> useShowVenueWifi, then the report's
    // venueWifi gate into ArmbandLabelCell (ArmbandLabelsReport's sharedCellProps).
    function LabelsFromProductionPath() {
      const { entries, wifiNetwork, wifiPassword } = useArmbandLabelData(ROUTE_SHOW_ID);
      const config = { ...DEFAULT_CONTENT_CONFIG, venueWifi: true };
      return (
        <>
          {entries.map(entry => (
            <ArmbandLabelCell
              key={entry.id}
              item={entry}
              config={config}
              labelHeight={1.333}
              labelWidth={4}
              numberDigits={3}
              wifiNetwork={config.venueWifi ? (wifiNetwork ?? undefined) : undefined}
              wifiPassword={config.venueWifi ? (wifiPassword ?? undefined) : undefined}
            />
          ))}
        </>
      );
    }
    render(
      <>
        <ShowDetailsPanel show={show} canManageShow entryCount={0} open showPublishing={false} />
        <LabelsFromProductionPath />
      </>
    );
    await screen.findByLabelText('Network Name');
    expect(await screen.findByText('101')).toBeInTheDocument();
    expect(screen.queryByText(/WiFi: ShowNet/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Network Name'), { target: { value: 'ShowNet' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'dog123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/WiFi: ShowNet\/dog123/)).toBeInTheDocument();
  });
});
