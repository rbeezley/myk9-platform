import { screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { captureCsvDownload } from '@/test/utils/csvDownload';
import { render } from '@/test/utils/testUtils';
import { ClassBulkActionsBar, type ClassBarItem } from '../ClassBulkActionsBar';

// MYK9-929 (M10 + owner decision 4): the class bulk bar names its buttons, and Export lives here.

const item = (id: string): ClassBarItem => ({
  id,
  name: `Class ${id}`,
  status: 'Scheduled',
  element: 'Containers',
  level: 'Novice',
  section: 'A',
  judgeName: 'Jane Judge',
  entryCount: 7,
  time: '9:00 AM',
  ring: 2,
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
  let download: ReturnType<typeof captureCsvDownload>;
  beforeEach(() => {
    download = captureCsvDownload();
  });
  afterEach(() => {
    download.restore();
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

    const lines = download.csv().split('\n');
    expect(lines[0]).toBe('Trial,Element,Level,Section,Judge,Time,Ring,Status,Entries');
    expect(lines).toHaveLength(3);
    // Section, judge and the entry count ride along, not only the name fields.
    expect(lines[1]).toBe(
      '"Saturday Trial 1","Containers","Novice","A","Jane Judge","9:00 AM","2","Scheduled","7"'
    );
  });
});
