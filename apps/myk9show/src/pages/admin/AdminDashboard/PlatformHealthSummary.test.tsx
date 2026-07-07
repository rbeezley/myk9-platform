import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { PlatformHealthSummary } from './PlatformHealthSummary';
import { useSystemHealthSnapshots } from '@/features/admin-system-health/useSystemHealthSnapshots';
import { useSupportTickets } from '@/features/support/useSupportTickets';
import type { SystemHealthSnapshot } from '@/features/admin-system-health/systemHealthTypes';
import type { SupportTicket } from '@/features/support/supportTickets';

vi.mock('@/features/admin-system-health/useSystemHealthSnapshots', () => ({
  useSystemHealthSnapshots: vi.fn(),
}));

vi.mock('@/features/support/useSupportTickets', () => ({
  useSupportTickets: vi.fn(),
}));

const mockedHealth = vi.mocked(useSystemHealthSnapshots);
const mockedSupport = vi.mocked(useSupportTickets);

type HealthHook = ReturnType<typeof useSystemHealthSnapshots>;
type SupportHook = ReturnType<typeof useSupportTickets>;

function healthHook(partial: {
  latest?: SystemHealthSnapshot | null;
  history?: SystemHealthSnapshot[];
  isLoading?: boolean;
  error?: unknown;
}): HealthHook {
  return {
    data:
      partial.latest === undefined && partial.history === undefined
        ? undefined
        : { latest: partial.latest ?? null, history: partial.history ?? [] },
    isLoading: partial.isLoading ?? false,
    error: partial.error ?? null,
  } as unknown as HealthHook;
}

function supportHook(partial: {
  tickets?: SupportTicket[];
  isLoading?: boolean;
  error?: unknown;
}): SupportHook {
  return {
    data: partial.tickets,
    isLoading: partial.isLoading ?? false,
    error: partial.error ?? null,
  } as unknown as SupportHook;
}

function snapshot(overrides: Partial<SystemHealthSnapshot> = {}): SystemHealthSnapshot {
  const now = new Date().toISOString();
  return {
    id: 'snapshot-1',
    createdAt: now,
    source: 'daily-health-check',
    overallStatus: 'ok',
    checks: [
      {
        key: 'migrations',
        label: 'Migration parity',
        status: 'ok',
        detail: 'Migration check passed',
        checkedAt: now,
      },
    ],
    runDurationMs: 100,
    ...overrides,
  };
}

function ticket(overrides: Partial<SupportTicket> = {}): SupportTicket {
  return {
    id: 'ticket-1',
    ownerId: 'owner-1',
    subject: 'Help',
    status: 'open',
    isShowDayPriority: false,
    diagnostics: {
      user: { authUserId: 'owner-1', databaseUserId: null, role: 'secretary' },
      route: '/admin/support',
      context: { showId: null, trialId: null, entryId: null },
      app: { version: null, capturedAt: new Date().toISOString() },
      connectivity: {
        online: true,
        replication: {
          status: null,
          lastSyncAt: null,
          queueSize: null,
          conflictCount: null,
          errorCount: null,
          watermark: null,
        },
      },
      clientErrors: [],
    },
    showId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('PlatformHealthSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedHealth.mockReturnValue(healthHook({ latest: snapshot() }));
    mockedSupport.mockReturnValue(supportHook({ tickets: [] }));
  });

  it('routes every summary card to its owner surface', () => {
    render(<PlatformHealthSummary />, { initialRoute: '/admin/dashboard' });

    expect(screen.getByRole('link', { name: /^System Health/i })).toHaveAttribute(
      'href',
      '/admin/health'
    );
    expect(screen.getByRole('link', { name: /^Support/i })).toHaveAttribute(
      'href',
      '/admin/support'
    );
    expect(screen.getByRole('link', { name: /^Sync Monitoring/i })).toHaveAttribute(
      'href',
      '/admin/sync'
    );
    expect(screen.getByRole('link', { name: /^Deleted Items/i })).toHaveAttribute(
      'href',
      '/admin/deleted-items'
    );
  });

  it('shows stale health as overdue instead of false healthy copy', () => {
    mockedHealth.mockReturnValue(
      healthHook({
        latest: snapshot({
          createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
          overallStatus: 'ok',
        }),
      })
    );

    render(<PlatformHealthSummary />, { initialRoute: '/admin/dashboard' });

    expect(screen.getByText('Run overdue')).toBeInTheDocument();
    expect(screen.queryByText('All systems healthy')).not.toBeInTheDocument();
  });

  it('shows support risk and show-day priority count', () => {
    mockedSupport.mockReturnValue(
      supportHook({
        tickets: [
          ticket({ id: 'open-1' }),
          ticket({ id: 'show-day-1', isShowDayPriority: true }),
          ticket({ id: 'resolved-1', status: 'resolved', isShowDayPriority: true }),
        ],
      })
    );

    render(<PlatformHealthSummary />, { initialRoute: '/admin/dashboard' });

    expect(screen.getByText('2 open')).toBeInTheDocument();
    expect(screen.getByText('1 show-day priority.')).toBeInTheDocument();
  });

  it('uses degraded copy when a dashboard signal cannot load', () => {
    mockedHealth.mockReturnValue(healthHook({ error: new Error('nope') }));
    mockedSupport.mockReturnValue(supportHook({ error: new Error('nope') }));

    render(<PlatformHealthSummary />, { initialRoute: '/admin/dashboard' });

    expect(screen.getAllByText('Unavailable')).toHaveLength(2);
    expect(screen.getByText(/Open Health to inspect/i)).toBeInTheDocument();
    expect(screen.getByText(/Open Support to inspect/i)).toBeInTheDocument();
  });

  it('surfaces a degraded sync check as a sync owner link', () => {
    mockedHealth.mockReturnValue(
      healthHook({
        latest: snapshot({
          checks: [
            {
              key: 'replication_queue',
              label: 'Replication queue',
              status: 'warn',
              detail: 'Queue is stale',
              checkedAt: new Date().toISOString(),
            },
          ],
        }),
      })
    );

    render(<PlatformHealthSummary />, { initialRoute: '/admin/dashboard' });

    expect(screen.getByRole('link', { name: /^Sync Monitoring/i })).toHaveAttribute(
      'href',
      '/admin/sync'
    );
    expect(screen.getByText('Queue is stale')).toBeInTheDocument();
  });
});
