import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { ReportPreview } from '../ReportPreview';
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

const trials = [
  {
    id: 'trial-1',
    trial_number: 1,
    date: '2026-05-11',
    registry_id: 'AKC',
  },
] as DbTrial[];

const classes = [
  {
    id: 'class-1',
    trial_id: 'trial-1',
    element: 'Buried',
    level: 'Novice',
    section: '',
    judge_name: 'Judge One',
  },
  {
    id: 'class-2',
    trial_id: 'trial-1',
    element: 'Interior',
    level: 'Advanced',
    section: '',
    judge_name: 'Judge Two',
  },
] as DbClass[];

const entries = [
  {
    id: 'entry-1',
    class_id: 'class-1',
    armband: 101,
    run_order: 1,
    check_in_status: 'checked-in',
    is_scored: true,
    result_status: 'qualified',
    search_time_seconds: 32.1,
    total_faults: 0,
    final_placement: 1,
    dog: {
      call_name: 'Scout',
      breed: 'Beagle',
      owner: { first_name: 'Jane', last_name: 'Handler' },
    },
  },
  {
    id: 'entry-2',
    class_id: 'class-2',
    armband: 202,
    run_order: 1,
    check_in_status: 'checked-in',
    is_scored: true,
    result_status: 'qualified',
    search_time_seconds: 41.2,
    total_faults: 0,
    final_placement: 1,
    dog: {
      call_name: 'Riley',
      breed: 'Corgi',
      owner: { first_name: 'Alex', last_name: 'Handler' },
    },
  },
] as unknown as DbEntry[];

describe('ReportPreview', () => {
  it('honors class scope for result catalog deep links', async () => {
    render(
      <ReportPreview
        reportType="result-catalog"
        show={show}
        trials={trials}
        classes={classes}
        entries={entries}
        trialId="trial-1"
        classId="class-1"
        dogId="all"
        sortOrder="placement"
        isLoading={false}
        isError={false}
      />
    );

    const iframe = screen.getByTitle('Report Preview') as HTMLIFrameElement;

    await waitFor(() => {
      const text = iframe.contentDocument?.body.textContent ?? '';
      expect(text).toContain('Buried Novice');
      expect(text).toContain('Scout');
      expect(text).toContain("Judge's Signature");
      expect(text).not.toContain('Interior Advanced');
      expect(text).not.toContain('Riley');
    });
  });

  it('ignores classId for show reports that do not declare class scope', async () => {
    render(
      <ReportPreview
        reportType="show-catalog"
        show={show}
        trials={trials}
        classes={classes}
        entries={entries}
        trialId="trial-1"
        classId="class-1"
        dogId="all"
        sortOrder="armband"
        isLoading={false}
        isError={false}
      />
    );

    const iframe = screen.getByTitle('Report Preview') as HTMLIFrameElement;

    await waitFor(() => {
      const text = iframe.contentDocument?.body.textContent ?? '';
      expect(text).toContain('Scout');
      expect(text).toContain('Riley');
    });
  });
});
