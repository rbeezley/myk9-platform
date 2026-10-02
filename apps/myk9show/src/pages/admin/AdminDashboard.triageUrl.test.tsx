import { describe, expect, it, vi } from 'vitest';
import { useLocation } from 'react-router-dom';
import { render, screen } from '@/test/utils/testUtils';
import AdminDashboard from './AdminDashboard';

const nowIso = new Date(Date.now() - 60_000).toISOString();

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ firstName: 'Pat' }),
}));

vi.mock('@/features/admin-system-health/useSystemHealthSnapshots', () => ({
  useSystemHealthSnapshots: () => ({
    isLoading: false,
    error: null,
    data: {
      latest: {
        id: 'snap',
        createdAt: nowIso,
        source: 'daily-health-check',
        overallStatus: 'fail',
        runDurationMs: 100,
        checks: [
          {
            key: 'payout_ledger',
            label: 'Payout ledger',
            status: 'fail',
            detail: 'payout drift',
            checkedAt: nowIso,
            verification: 'proven',
          },
          {
            key: 'edge-fns',
            label: 'Edge functions',
            status: 'fail',
            detail: 'one function drifted',
            checkedAt: nowIso,
            verification: 'proven',
          },
        ],
      },
      history: [],
    },
  }),
}));

vi.mock('@/features/admin-system-health/useOperatorAlerts', () => ({
  useOperatorAlerts: () => ({ isLoading: false, error: null, data: [] }),
}));

vi.mock('@/features/admin-overview/useAdminOverview', () => ({
  useAdminOverview: () => ({ data: undefined, error: null, isLoading: false }),
}));

vi.mock('@/features/admin-overview/useSentryDashboardMetrics', () => ({
  useSentryDashboardMetrics: () => ({ data: undefined, error: null, isLoading: false }),
}));

function UrlProbe() {
  return <output data-testid="url-search">{useLocation().search}</output>;
}

const VIEW = { name: /show: filter what needs a look/i };

describe('AdminDashboard Needs a look URL state', () => {
  it('applies the triage view from the URL and keeps unrelated params', async () => {
    const { user } = render(
      <>
        <AdminDashboard />
        <UrlProbe />
      </>,
      { initialRoute: '/admin/dashboard?triage=money&keep=1' }
    );

    expect(await screen.findByText('Showing 1 of 2 open items.')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', VIEW));
    await user.click(await screen.findByRole('option', { name: /^Service/ }));

    const params = new URLSearchParams(screen.getByTestId('url-search').textContent ?? '');
    expect(params.get('triage')).toBe('service');
    expect(params.get('keep')).toBe('1');
  });

  it('ignores an unknown triage value', async () => {
    render(<AdminDashboard />, { initialRoute: '/admin/dashboard?triage=bogus' });
    expect(await screen.findByText('Showing all 2 open items.')).toBeInTheDocument();
  });
});
