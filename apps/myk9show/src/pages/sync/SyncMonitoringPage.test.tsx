import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';

vi.mock('../../components/sync/SyncMonitoringDashboard', () => ({
  default: () => <div data-testid="sync-monitoring-dashboard" />,
}));

const { default: SyncMonitoringPage } = await import('./SyncMonitoringPage');

describe('SyncMonitoringPage responsive container', () => {
  it('sizes the existing dashboard from the available admin content width', () => {
    render(<SyncMonitoringPage />);

    expect(screen.getByTestId('sync-monitoring-dashboard').parentElement).toHaveClass(
      'manager-content-container'
    );
  });
});
