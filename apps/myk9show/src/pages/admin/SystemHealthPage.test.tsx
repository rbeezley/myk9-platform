import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { render, screen } from '@/test/utils/testUtils';
import SystemHealthPage from './SystemHealthPage';
import type { SystemHealthSnapshot } from '@/features/admin-system-health/systemHealthTypes';
import type { SystemHealthData } from '@/features/admin-system-health/useSystemHealthSnapshots';
import {
  useRunSystemHealthCheck,
  useSystemHealthSnapshots,
} from '@/features/admin-system-health/useSystemHealthSnapshots';
import {
  useOperatorAlerts,
  useResolveOperatorAlert,
} from '@/features/admin-system-health/useOperatorAlerts';

vi.mock('@/features/admin-system-health/useSystemHealthSnapshots', () => ({
  useSystemHealthSnapshots: vi.fn(),
  useRunSystemHealthCheck: vi.fn(),
  HISTORY_LIMIT: 7,
}));

// The unresolved-alerts section (OperatorAlertsSection) is mounted on this
// page but has its own dedicated test coverage — mock it out here so these
// tests stay isolated to the snapshot board and never issue a real
// operator_alerts read.
vi.mock('@/features/admin-system-health/useOperatorAlerts', () => ({
  useOperatorAlerts: vi.fn(),
  useResolveOperatorAlert: vi.fn(),
  OPERATOR_ALERTS_QUERY_KEY: ['admin', 'system-health', 'operator-alerts'],
}));

const mockedHook = vi.mocked(useSystemHealthSnapshots);
const mockedRunHealthCheck = vi.mocked(useRunSystemHealthCheck);
const mockedOperatorAlertsHook = vi.mocked(useOperatorAlerts);
const mockedResolveOperatorAlertHook = vi.mocked(useResolveOperatorAlert);

type HookResult = ReturnType<typeof useSystemHealthSnapshots>;

function hookState(partial: {
  data?: SystemHealthData;
  isLoading?: boolean;
  error?: unknown;
}): HookResult {
  return {
    data: partial.data,
    isLoading: partial.isLoading ?? false,
    error: partial.error ?? null,
  } as unknown as HookResult;
}

function freshSnapshot(overrides: Partial<SystemHealthSnapshot> = {}): SystemHealthSnapshot {
  const nowIso = new Date(Date.now() - 60_000).toISOString();
  return {
    id: 'snap-fresh',
    createdAt: nowIso,
    source: 'daily-health-check',
    overallStatus: 'ok',
    checks: [
      {
        key: 'migrations',
        label: 'Migration parity',
        status: 'ok',
        detail: 'local and remote agree',
        checkedAt: nowIso,
        verification: 'proven' as const,
      },
      {
        key: 'edge-fns',
        label: 'Edge-function parity',
        status: 'warn',
        detail: 'one function drifted',
        checkedAt: nowIso,
        verification: 'proven' as const,
      },
    ],
    runDurationMs: 1500,
    ...overrides,
  };
}

describe('SystemHealthPage', () => {
  beforeEach(() => {
    mockedHook.mockReset();
    mockedRunHealthCheck.mockReset();
    mockedOperatorAlertsHook.mockReset();
    mockedResolveOperatorAlertHook.mockReset();
    mockedOperatorAlertsHook.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useOperatorAlerts>);
    mockedResolveOperatorAlertHook.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useResolveOperatorAlert>);
    mockedRunHealthCheck.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
      data: undefined,
    } as unknown as ReturnType<typeof useRunSystemHealthCheck>);
  });

  it('renders per-check rows for a fresh snapshot', () => {
    const latest = freshSnapshot();
    mockedHook.mockReturnValue(hookState({ data: { latest, history: [latest] } }));

    render(<SystemHealthPage />);

    // The verdict leads with a plain-language answer, not a status word.
    expect(screen.getByText(/nothing is failing/i)).toBeInTheDocument();
    expect(screen.getByText('Migration parity')).toBeInTheDocument();
    expect(screen.getByText('local and remote agree')).toBeInTheDocument();
    expect(screen.getByText('Edge-function parity')).toBeInTheDocument();
    // run duration is surfaced on the freshness band (fixture is 1500ms)
    expect(screen.getByText(/last run took 1\.5s/)).toBeInTheDocument();
  });

  it('offers a real Run now action without discarding the selected filter', () => {
    const latest = freshSnapshot();
    const mutateAsync = vi.fn().mockResolvedValue({ completed: true });
    mockedRunHealthCheck.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: null,
      data: undefined,
    } as unknown as ReturnType<typeof useRunSystemHealthCheck>);
    mockedHook.mockReturnValue(hookState({ data: { latest, history: [latest] } }));

    render(<SystemHealthPage />);
    fireEvent.click(screen.getByRole('tab', { name: /^Failing 0$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/nothing in this bucket/i)).toBeInTheDocument();
  });

  it('derives every count from one array, so no two badges can disagree', () => {
    const latest = freshSnapshot(); // one ok + one warn
    mockedHook.mockReturnValue(hookState({ data: { latest, history: [latest] } }));

    render(<SystemHealthPage />);

    // Verdict chips and filter tabs read the same summary.
    expect(screen.getByRole('tab', { name: /^All 2$/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Failing 0$/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Unverified 1$/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Passing 1$/ })).toBeInTheDocument();
  });

  it('filters the list to the tab the admin picked', () => {
    const latest = freshSnapshot();
    mockedHook.mockReturnValue(hookState({ data: { latest, history: [latest] } }));

    render(<SystemHealthPage />);
    fireEvent.click(screen.getByRole('tab', { name: /^Failing 0$/ }));

    expect(screen.queryByText('Migration parity')).not.toBeInTheDocument();
    expect(screen.getByText(/nothing in this bucket/i)).toBeInTheDocument();
  });

  it('shows a stale warning when the latest run is older than the threshold', () => {
    const staleIso = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(); // 30h
    const latest = freshSnapshot({ id: 'snap-stale', createdAt: staleIso, overallStatus: 'ok' });
    mockedHook.mockReturnValue(hookState({ data: { latest, history: [latest] } }));

    render(<SystemHealthPage />);

    // Staleness is a first-class band, and it outranks the stored 'ok'.
    expect(screen.getByRole('alert')).toHaveTextContent(/too old to answer/i);
    expect(screen.getByRole('heading', { name: /too old to answer/i })).toBeInTheDocument();
  });

  it('shows an empty state when no snapshot exists', () => {
    mockedHook.mockReturnValue(hookState({ data: { latest: null, history: [] } }));

    render(<SystemHealthPage />);

    expect(screen.getByText('No health run has ever been recorded')).toBeInTheDocument();
    expect(screen.getByText(/never written a snapshot/i)).toBeInTheDocument();
    // An empty board must not render counts that read as "all clear".
    expect(screen.queryByText('passing')).not.toBeInTheDocument();
  });

  it('shows an error state when the query fails', () => {
    mockedHook.mockReturnValue(hookState({ error: new Error('boom') }));

    render(<SystemHealthPage />);

    expect(screen.getByText(/system health didn.t load/i)).toBeInTheDocument();
  });

  it('still renders OperatorAlertsSection when the snapshot query errors — money-path alerts must not hide behind an unrelated snapshots outage', () => {
    mockedHook.mockReturnValue(hookState({ error: new Error('boom') }));

    render(<SystemHealthPage />);

    expect(screen.getByText(/system health didn.t load/i)).toBeInTheDocument();
    expect(screen.getByText('Unresolved Alerts')).toBeInTheDocument();
  });

  it('renders a loading state while fetching', () => {
    mockedHook.mockReturnValue(hookState({ isLoading: true }));

    render(<SystemHealthPage />);

    expect(screen.getByRole('status', { name: 'Loading system health' })).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
    expect(screen.queryByText(/loading the latest health snapshot/i)).not.toBeInTheDocument();
  });

  it('still renders OperatorAlertsSection while the snapshot query is loading', () => {
    mockedHook.mockReturnValue(hookState({ isLoading: true }));

    render(<SystemHealthPage />);

    expect(screen.getByText('Unresolved Alerts')).toBeInTheDocument();
  });

  it('renders a per-check history strip, oldest run first', () => {
    const older = freshSnapshot({
      id: 'older',
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      checks: [
        {
          key: 'migrations',
          label: 'Migration parity',
          status: 'fail',
          detail: 'drifted',
          checkedAt: null,
          verification: 'proven' as const,
        },
      ],
    });
    const latest = freshSnapshot({ id: 'newer' });
    mockedHook.mockReturnValue(hookState({ data: { latest, history: [latest, older] } }));

    render(<SystemHealthPage />);

    // The strip belongs to the check, not the page, and reads oldest -> newest
    // so its right-hand bar is the same run the row's badge describes.
    expect(
      screen.getByRole('img', { name: /Migration parity: last 2 runs, oldest first/i })
    ).toHaveAccessibleName(/fail, ok/i);
  });

  it('renders degraded health checks with owner actions', () => {
    const latest = freshSnapshot({
      checks: [
        {
          key: 'replication_queue',
          label: 'Replication queue',
          status: 'warn',
          detail: 'Queue is stale',
          checkedAt: new Date().toISOString(),
          verification: 'proven' as const,
        },
      ],
    });
    mockedHook.mockReturnValue(hookState({ data: { latest, history: [latest] } }));

    render(<SystemHealthPage />);

    // Owner and next step live in the expanded detail — the row is a summary
    // until the admin drills in.
    expect(screen.queryByText('Sync Monitoring')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Replication queue/i }));

    expect(screen.getByText('Sync Monitoring')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Sync/i })).toHaveAttribute('href', '/admin/sync');
    expect(screen.getByText(/Review device queues/i)).toBeInTheDocument();
  });

  it('renders coverage incomplete as a distinct state with a next action', () => {
    const latest = freshSnapshot({
      checks: [
        {
          key: 'manual_check',
          label: 'Manual check',
          status: 'unknown',
          detail: 'Coverage incomplete: not checked here',
          checkedAt: null,
          verification: 'proven' as const,
        },
      ],
    });
    mockedHook.mockReturnValue(hookState({ data: { latest, history: [latest] } }));

    render(<SystemHealthPage />);

    // A check whose own coverage is incomplete cannot report success, so it
    // carries the amber word rather than being downgraded to a plain warning.
    expect(screen.getByText('Unverified')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Manual check/i }));
    expect(screen.getByText('Operations Runbook')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Admin Help/i })).toHaveAttribute(
      'href',
      '/admin/help'
    );
  });

  it('names the unprovable checks on the Coverage card', () => {
    const latest = freshSnapshot({
      checks: [
        {
          key: 'payout_cron',
          label: 'Nightly payout job',
          status: 'warn',
          detail: 'dispatched, but the Edge Function response is never read',
          checkedAt: new Date().toISOString(),
          verification: 'unprovable' as const,
        },
      ],
    });
    mockedHook.mockReturnValue(hookState({ data: { latest, history: [latest] } }));

    render(<SystemHealthPage />);

    // Named on the row and again on the Coverage card — the card exists to say
    // what the checks can't prove, so repeating the label there is the point.
    expect(screen.getAllByText(/Nightly payout job/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/silent failure would still look green/i)).toBeInTheDocument();
  });
});
