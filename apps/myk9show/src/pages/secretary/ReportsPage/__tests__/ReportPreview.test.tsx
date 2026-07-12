import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { ReportPreview } from '../ReportPreview';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';

const show = fromPartial<Show>({
  id: 'show-1',
  name: 'Spring Trial',
  organization: 'AKC',
  clubName: 'Calm Canine Club',
  startDate: '2026-05-11',
  endDate: '2026-05-11',
});

const trials = [
  fromPartial<DbTrial>({
    id: 'trial-1',
    trial_number: '1',
    date: '2026-05-11',
    registry_id: 'AKC',
  }),
];

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
  it('renders assignment-backed class judges in check-in sheet previews', async () => {
    const assignmentClasses = [
      {
        ...classes[0],
        judge_name: null,
        judge_assignments: [
          {
            person_id: 'judge-1',
            people: { first_name: 'Assigned', last_name: 'Judge' },
          },
        ],
      },
    ] as unknown as DbClass[];

    render(
      <ReportPreview
        reportType="check-in-sheet"
        show={show}
        trials={trials}
        classes={assignmentClasses}
        entries={[entries[0]!]}
        trialId="trial-1"
        classId="class-1"
        dogId="all"
        sortOrder="run-order"
        isLoading={false}
        isError={false}
      />
    );

    const iframe = screen.getByTitle('Report Preview') as HTMLIFrameElement;

    await waitFor(() => {
      const text = iframe.contentDocument?.body.textContent ?? '';
      expect(text).toContain('Assigned Judge');
      expect(text).not.toContain('Judge One');
      expect(text).not.toContain('Judge: TBD');
    });
  });

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

    const scrollArea = screen.getByRole('region', { name: 'Report preview scroll area' });
    expect(scrollArea.className).toContain('overflow-x-auto');
    expect(scrollArea).toHaveAttribute('tabindex', '0');
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
      expect(text).toContain('May 11, 2026');
      expect(text).not.toContain('2026-05-11');
    });
  });

  it('announces the loading state via role=status', () => {
    render(
      <ReportPreview
        reportType="result-catalog"
        show={show}
        trials={trials}
        classes={classes}
        entries={entries}
        trialId="all"
        classId="all"
        dogId="all"
        sortOrder="armband"
        isLoading={true}
        isError={false}
      />
    );

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading report data');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('renders a retry affordance on error and calls onRetry when clicked', async () => {
    const onRetry = vi.fn();
    render(
      <ReportPreview
        reportType="result-catalog"
        show={show}
        trials={trials}
        classes={classes}
        entries={entries}
        trialId="all"
        classId="all"
        dogId="all"
        sortOrder="armband"
        isLoading={false}
        isError={true}
        onRetry={onRetry}
      />
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'assertive');

    const retry = screen.getByRole('button', { name: 'Try again' });
    await userEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits the retry button when no onRetry handler is provided', () => {
    render(
      <ReportPreview
        reportType="result-catalog"
        show={show}
        trials={trials}
        classes={classes}
        entries={entries}
        trialId="all"
        classId="all"
        dogId="all"
        sortOrder="armband"
        isLoading={false}
        isError={true}
      />
    );

    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
