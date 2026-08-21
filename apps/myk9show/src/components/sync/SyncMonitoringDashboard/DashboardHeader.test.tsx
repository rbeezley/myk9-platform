import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { DashboardHeader } from './DashboardHeader';

describe('DashboardHeader responsive composition', () => {
  it('uses the shared content-width header without duplicating keyboard actions', async () => {
    const { user } = render(
      <div className="manager-content-container">
        <DashboardHeader
          timeRange="24h"
          onTimeRangeChange={vi.fn()}
          onExport={vi.fn()}
          onManualSync={vi.fn()}
          isRefreshing={false}
        />
      </div>
    );

    const heading = screen.getByRole('heading', { name: 'Sync Monitoring' });
    const header = heading.closest('.manager-page-header');
    expect(header).toHaveClass('manager-page-header--compact');

    const exportButton = screen.getByRole('button', { name: 'Export' });
    const syncButton = screen.getByRole('button', { name: 'Sync Now' });
    expect(exportButton.parentElement).toHaveClass('manager-page-actions');
    expect(screen.getAllByRole('button', { name: 'Export' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Sync Now' })).toHaveLength(1);

    await user.tab();
    expect(screen.getByRole('combobox')).toHaveFocus();
    await user.tab();
    expect(exportButton).toHaveFocus();
    await user.tab();
    expect(syncButton).toHaveFocus();
  });
});
