import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/test/utils/testUtils';
import { __resetContainmentMemoForTests } from '@/hooks/useReplicationContainment';
import { ReplicationSyncTestProvider } from '@/test/utils/ReplicationSyncTestProvider';
import {
  CompactOfflineIndicator,
  FilterTriggerButton,
  PullToRefresh,
} from './atShowLayoutSlotComponents';

const { network, syncState } = vi.hoisted(() => ({
  network: { isOnline: true },
  syncState: { status: 'synced', queueSize: 0 },
}));
vi.mock('@/lib/networkUtils', () => ({ useOnlineStatus: () => network.isOnline }));
vi.mock('@/hooks/useGlobalSyncStatus', () => ({ useGlobalSyncStatus: () => syncState }));

// File-level so no describe block can leak an offline state into another under shuffle.
beforeEach(() => {
  network.isOnline = true;
  syncState.status = 'synced';
  syncState.queueSize = 0;
});

// MYK9-115 Task 5. The client pauses score uploads when the server raises
// RS429; without this banner it pauses SILENTLY, and a queue that stops
// draining with no explanation is indistinguishable from lost work.
describe('ContainmentBanner', () => {
  // The containment deadline lives in module scope so a component mounting
  // mid-pause still shows the banner — deliberate, and documented in the hook.
  // The cost is that a pause opened by one case outlives it: `until` is an
  // absolute timestamp, so it stays in the future for the rest of the file and
  // the "is absent" case then sees a banner another case raised.
  //
  // CI runs with `--sequence.shuffle`, so whether that ordering is reached
  // varies per run — it passed locally at 5083/5083 on one seed while failing
  // twice in CI on others. `useReplicationContainment.test.ts` already calls
  // this reset; this file was the one that did not.
  beforeEach(__resetContainmentMemoForTests);

  const contain = (untilMsFromNow: number) =>
    act(() => {
      window.dispatchEvent(
        new CustomEvent('replication:containment', {
          detail: { until: Date.now() + untilMsFromNow },
        })
      );
    });

  it('is absent until the server actually asks for a pause', () => {
    render(
      <PullToRefresh onRefresh={async () => {}}>
        <div>entries</div>
      </PullToRefresh>
    );

    expect(screen.queryByTestId('at-show-containment-banner')).toBeNull();
    expect(screen.getByText('entries')).toBeInTheDocument();
  });

  it('appears on the containment event and leads with the scores being safe', () => {
    render(
      <PullToRefresh onRefresh={async () => {}}>
        <div>entries</div>
      </PullToRefresh>
    );
    contain(60_000);

    const banner = screen.getByTestId('at-show-containment-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/Score sync paused/);
    expect(banner).toHaveTextContent(/scores are saved here/i);
    // Named as the server's decision, not the device's or the network's.
    expect(banner).toHaveTextContent(/the server asked this device to wait/i);
  });

  it('offers no retry control — retrying is what the breaker is stopping', () => {
    render(
      <PullToRefresh onRefresh={async () => {}}>
        <div>entries</div>
      </PullToRefresh>
    );
    contain(60_000);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('announces itself to assistive tech without stealing focus', () => {
    render(
      <PullToRefresh onRefresh={async () => {}}>
        <div>entries</div>
      </PullToRefresh>
    );
    contain(60_000);

    expect(screen.getByTestId('at-show-containment-banner')).toHaveAttribute('role', 'status');
  });

  it('never hides the entry list behind it', () => {
    render(
      <PullToRefresh onRefresh={async () => {}}>
        <div>entries</div>
      </PullToRefresh>
    );
    contain(60_000);

    expect(screen.getByText('entries')).toBeInTheDocument();
  });
});

describe('CompactOfflineIndicator', () => {
  it('labels offline capability without implying the device is currently offline', () => {
    // The chip now consults replication sync so it cannot promise readiness
    // before the data is local; the CAPABILITY framing this case pins (#739) is
    // unchanged, so the case only needs its new dependency supplied.
    render(
      <ReplicationSyncTestProvider
        value={
          {
            status: {
              lastSyncAt: new Date(),
              isSyncing: false,
              tablesStatus: {
                shows: 'success',
                trials: 'success',
                classes: 'success',
                entries: 'success',
              },
            },
          } as never
        }
      >
        <CompactOfflineIndicator />
      </ReplicationSyncTestProvider>
    );

    expect(screen.getByText('Offline ready')).toBeInTheDocument();
    expect(screen.queryByText(/^Offline$/)).toBeNull();
  });
});

describe('CompactOfflineIndicator offline state (MYK9-1744)', () => {
  const readyStatus = {
    status: {
      lastSyncAt: new Date(),
      isSyncing: false,
      tablesStatus: { shows: 'success', trials: 'success', classes: 'success', entries: 'success' },
    },
  } as never;
  const renderReady = () =>
    render(
      <ReplicationSyncTestProvider value={readyStatus}>
        <CompactOfflineIndicator />
      </ReplicationSyncTestProvider>
    );

  it('ready and online keeps the chip hidden on phones (unchanged)', () => {
    renderReady();
    expect(screen.getByText('Offline ready').parentElement?.className).toContain('max-sm:hidden');
    expect(screen.queryByText(/saved on this device/)).toBeNull();
  });

  it('ready and offline shows the amber note on one truncated line', () => {
    network.isOnline = false;
    syncState.status = 'offline';
    renderReady();

    const note = screen.getByText('Offline · scores saved on this device');
    const line = note.closest('[role="status"]') as HTMLElement;
    expect(line.className).toContain('text-warning');
    expect(line.className).not.toContain('max-sm:hidden');
    expect(line.title).toBe('You are offline. Everything you enter is saved on this device.');
    expect(note.className).toContain('truncate');
    expect(screen.queryByText('Offline ready')).toBeNull();
  });

  it('gives phones an icon-only 44px button that opens the note, with no label in the bar', () => {
    network.isOnline = false;
    syncState.status = 'offline';
    syncState.queueSize = 2;
    renderReady();

    const button = screen.getByRole('button', { name: 'Offline' });
    expect(button.className).toContain('min-h-11');
    expect(button.className).toContain('min-w-11');
    expect(button).toHaveTextContent('');
    expect(button.closest('span.sm\\:hidden')).not.toBeNull();
    fireEvent.click(button);
    expect(screen.getAllByText('Offline · 2 changes saved on this device')).toHaveLength(2);
  });

  it('passes the pending change count through', () => {
    network.isOnline = false;
    syncState.status = 'offline';
    syncState.queueSize = 3;
    renderReady();

    expect(screen.getByText('Offline · 3 changes saved on this device')).toBeInTheDocument();
  });
});

describe('FilterTriggerButton active-filter dot', () => {
  it('uses the 44px icon button size for ringside touch viewports', () => {
    render(<FilterTriggerButton onClick={() => {}} hasActiveFilters />);

    const trigger = screen.getByRole('button', { name: 'Search & sort' });
    expect(trigger.className).toContain('h-11');
    expect(trigger.className).toContain('w-11');
    expect(trigger.className).toContain('min-h-[44px]');
    expect(trigger.className).toContain('min-w-[44px]');
  });

  it('paints the dot with the semantic primary token, not a hardcoded hex', () => {
    const { container } = render(<FilterTriggerButton onClick={() => {}} hasActiveFilters />);

    // The dot must theme with --primary so it tracks the active palette in both
    // light and dark; a raw hex fallback (#14b8a6) would freeze it to one teal.
    const dot = container.querySelector('span.absolute');
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain('bg-primary');
    expect(dot?.className).not.toContain('14b8a6');
  });

  it('omits the dot when there are no active filters', () => {
    const { container } = render(
      <FilterTriggerButton onClick={() => {}} hasActiveFilters={false} />
    );

    expect(container.querySelector('span.absolute')).toBeNull();
  });
});
