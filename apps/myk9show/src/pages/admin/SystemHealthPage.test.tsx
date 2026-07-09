import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import SystemHealthPage from './SystemHealthPage';
import type { SystemHealthSnapshot } from '@/features/admin-system-health/systemHealthTypes';
import type { SystemHealthData } from '@/features/admin-system-health/useSystemHealthSnapshots';
import { useSystemHealthSnapshots } from '@/features/admin-system-health/useSystemHealthSnapshots';
import {
  useOperatorAlerts,
  useResolveOperatorAlert,
} from '@/features/admin-system-health/useOperatorAlerts';

vi.mock('@/features/admin-system-health/useSystemHealthSnapshots', () => ({
  useSystemHealthSnapshots: vi.fn(),
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
      },
      {
        key: 'edge-fns',
        label: 'Edge-function parity',
        status: 'warn',
        detail: 'one function drifted',
        checkedAt: nowIso,
      },
    ],
    runDurationMs: 1500,
    ...overrides,
  };
}

describe('SystemHealthPage', () => {
  beforeEach(() => {
    mockedHook.mockReset();
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
  });

  it('renders per-check rows for a fresh snapshot', () => {
    const latest = freshSnapshot();
    mockedHook.mockReturnValue(hookState({ data: { latest, history: [latest] } }));

    render(<SystemHealthPage />);

    expect(screen.getByText('All systems healthy')).toBeInTheDocument();
    expect(screen.getByText('Migration parity')).toBeInTheDocument();
    expect(screen.getByText('local and remote agree')).toBeInTheDocument();
    expect(screen.getByText('Edge-function parity')).toBeInTheDocument();
    // relative freshness label rendered per check
    expect(screen.getAllByText(/checked .* ago/i).length).toBeGreaterThan(0);
    // run duration is surfaced in the banner meta line (fixture is 1500ms)
    expect(screen.getByText(/took 1\.5s/)).toBeInTheDocument();
  });

  it('shows a stale warning when the latest run is older than the threshold', () => {
    const staleIso = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(); // 30h
    const latest = freshSnapshot({ id: 'snap-stale', createdAt: staleIso, overallStatus: 'ok' });
    mockedHook.mockReturnValue(hookState({ data: { latest, history: [latest] } }));

    render(<SystemHealthPage />);

    expect(screen.getByText('Health run overdue')).toBeInTheDocument();
    // stale forces the overall headline to the failure copy despite stored 'ok'
    expect(screen.getByText('Attention needed')).toBeInTheDocument();
  });

  it('shows an empty state when no snapshot exists', () => {
    mockedHook.mockReturnValue(hookState({ data: { latest: null, history: [] } }));

    render(<SystemHealthPage />);

    expect(screen.getByText('No health run recorded yet')).toBeInTheDocument();
    expect(screen.getByText(/daily health job may not be running/i)).toBeInTheDocument();
  });

  it('shows an error state when the query fails', () => {
    mockedHook.mockReturnValue(hookState({ error: new Error('boom') }));

    render(<SystemHealthPage />);

    expect(screen.getByText(/couldn.t load system health/i)).toBeInTheDocument();
  });

  it('still renders OperatorAlertsSection when the snapshot query errors — money-path alerts must not hide behind an unrelated snapshots outage', () => {
    mockedHook.mockReturnValue(hookState({ error: new Error('boom') }));

    render(<SystemHealthPage />);

    expect(screen.getByText(/couldn.t load system health/i)).toBeInTheDocument();
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

  it('renders the recent-run history strip', () => {
    const a = freshSnapshot({ id: 'a', overallStatus: 'ok' });
    const b = freshSnapshot({ id: 'b', overallStatus: 'fail' });
    mockedHook.mockReturnValue(hookState({ data: { latest: a, history: [a, b] } }));

    render(<SystemHealthPage />);

    const strip = screen.getByLabelText('Recent run history');
    expect(strip).toBeInTheDocument();
    expect(screen.getByLabelText(/OK run/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Fail run/i)).toBeInTheDocument();
    expect(screen.getAllByText(/daily-health-check/i).length).toBeGreaterThan(0);
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
        },
      ],
    });
    mockedHook.mockReturnValue(hookState({ data: { latest, history: [latest] } }));

    render(<SystemHealthPage />);

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
        },
      ],
    });
    mockedHook.mockReturnValue(hookState({ data: { latest, history: [latest] } }));

    render(<SystemHealthPage />);

    expect(screen.getByText('Coverage incomplete')).toBeInTheDocument();
    expect(screen.getByText('Operations Runbook')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Admin Help/i })).toHaveAttribute(
      'href',
      '/admin/help'
    );
  });
});
