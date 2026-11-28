import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import AdminDashboard from './AdminDashboard';

const mocks = vi.hoisted(() => ({ waiting: vi.fn() }));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ firstName: 'Pat' }),
}));
vi.mock('@/features/admin-system-health/useSystemHealthSnapshots', () => ({
  useSystemHealthSnapshots: () => ({ isLoading: false, error: null, data: undefined }),
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
vi.mock('./useWaitingClubs', () => ({ useWaitingClubs: mocks.waiting }));

describe('AdminDashboard clubs waiting count', () => {
  it('keeps the count current while the page stays open, every 60 seconds', async () => {
    mocks.waiting.mockReturnValue({ count: 3, rows: [] });
    render(<AdminDashboard />, { initialRoute: '/admin/dashboard' });
    expect(await screen.findAllByRole('link', { name: /open system health/i })).not.toHaveLength(0);
    expect(mocks.waiting).toHaveBeenCalledWith({ refetchIntervalMs: 60_000 });
  });
});
