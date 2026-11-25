import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { fromAny } from '@total-typescript/shoehorn';
import { ReportPreview } from '../ReportPreview';
import { ReportControlsBar } from '../ReportControlsBar';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';

const show = {
  id: 'show-1',
  name: 'Spring Trial',
  organization: 'AKC',
  clubName: 'Calm Canine Club',
  startDate: '2026-05-11',
  endDate: '2026-05-11',
} as Show;
const trials = fromAny<DbTrial[], unknown>([
  { id: 'trial-1', trial_number: 1, date: '2026-05-11', registry_id: 'AKC' },
]);
const classes = [
  { id: 'class-1', trial_id: 'trial-1', element: 'Buried', level: 'Novice', section: '' },
] as unknown as DbClass[];

function entry(armband: number, entryStatus: string): DbEntry {
  return {
    id: `entry-${armband}`,
    class_id: 'class-1',
    armband,
    run_order: armband,
    entry_status: entryStatus,
    check_in_status: 'no-status',
    dog: { call_name: `Dog${armband}`, breed: 'Beagle' },
  } as unknown as DbEntry;
}

function preview(reportType: string, entries: DbEntry[], onEmptySheetChange = vi.fn()) {
  render(
    <ReportPreview
      reportType={reportType}
      show={show}
      trials={trials}
      classes={classes}
      entries={entries}
      trialId="trial-1"
      classId="class-1"
      dogId="all"
      sortOrder="run-order"
      isLoading={false}
      isError={false}
      dataState="ready"
      onEmptySheetChange={onEmptySheetChange}
    />
  );
  return onEmptySheetChange;
}

describe('a sheet with no running dog (MYK9-2387)', () => {
  const sitOut = [entry(1, 'pending'), entry(2, 'withdrawn')];

  it('tells the page the scoresheet is empty, so Print can be left off', async () => {
    const onEmpty = preview('scoresheet', sitOut);
    expect(
      screen.getByText('No dog in this selection is running, so there is no score sheet to print.')
    ).toBeInTheDocument();
    await waitFor(() => expect(onEmpty).toHaveBeenLastCalledWith(true));
  });

  it('does not call the check-in sheet empty: it lists those dogs', async () => {
    const onEmpty = preview('check-in-sheet', sitOut);
    await waitFor(() => expect(onEmpty).toHaveBeenCalledWith(false));
    expect(onEmpty).not.toHaveBeenCalledWith(true);
  });

  it('does not call the scoresheet empty when a dog runs', async () => {
    const onEmpty = preview('scoresheet', [...sitOut, entry(3, 'confirmed')]);
    await waitFor(() => expect(onEmpty).toHaveBeenCalledWith(false));
    expect(onEmpty).not.toHaveBeenCalledWith(true);
  });

  it('turns the Print button off for an empty sheet', () => {
    render(
      <ReportControlsBar
        reportType="scoresheet"
        trialId="trial-1"
        classId="class-1"
        dogId="all"
        sortOrder="run-order"
        trials={[]}
        classes={[]}
        dogs={[]}
        onTrialChange={vi.fn()}
        onClassChange={vi.fn()}
        onDogChange={vi.fn()}
        onSortChange={vi.fn()}
        onPrint={vi.fn()}
        noRunningDogs
      />
    );
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
  });
});
