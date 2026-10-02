import { screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ClassBulkActionsBar, type ClassBarItem } from '../ClassBulkActionsBar';

// MYK9-929 (M10 + owner decision 4): the class bulk bar names its buttons, and Export lives here.

const downloadCsv = vi.hoisted(() => vi.fn());
vi.mock('@/utils/downloadCsv', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/downloadCsv')>()),
  downloadCsv,
}));

const item = (id: string): ClassBarItem => ({
  id,
  name: `Class ${id}`,
  status: 'Scheduled',
  element: 'Containers',
  level: 'Novice',
  trialLabel: 'Saturday Trial 1',
});

function setup(selected: ClassBarItem[], bulkBusy = false) {
  return render(
    <ClassBulkActionsBar
      selectedClasses={selected}
      bulkBusy={bulkBusy}
      onBulkStatusChange={vi.fn().mockResolvedValue(true)}
      onClear={vi.fn()}
      context={{ showId: 's1', trialId: 't1' }}
    />
  );
}

describe('ClassBulkActionsBar named buttons', () => {
  beforeEach(() => {
    downloadCsv.mockReset();
  });

  it('offers Change status, Export and Delete as named buttons and no bare menu', () => {
    setup([item('1'), item('2')]);
    expect(screen.getByRole('button', { name: 'Change status' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /bulk class actions/i })).not.toBeInTheDocument();
  });

  it('puts the status choices under Change status', async () => {
    const { user } = setup([item('1')]);
    await user.click(screen.getByRole('button', { name: 'Change status' }));
    expect(await screen.findByRole('menuitem', { name: /mark 1 of 1 in progress/i })).toBeVisible();
  });

  it('disables every named button while a bulk operation runs', () => {
    setup([item('1')], true);
    expect(screen.getByRole('button', { name: 'Change status' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
  });

  it('Export downloads the selected classes as CSV', async () => {
    const { user } = setup([item('1'), item('2')]);
    await user.click(screen.getByRole('button', { name: 'Export' }));

    expect(downloadCsv).toHaveBeenCalledOnce();
    const [filename, csv] = downloadCsv.mock.calls[0] as [string, string];
    expect(filename).toMatch(/^classes-export-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(csv.split('\n')).toHaveLength(3);
    expect(csv).toContain('Containers');
  });
});
