import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { ReportPreview } from '../ReportPreview';
import { getReportById } from '@/lib/reports/reportRegistry';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';
import { fromAny } from '@total-typescript/shoehorn';

const show = {
  id: 'show-1',
  name: 'Spring Trial',
  organization: 'AKC',
  clubName: 'Calm Canine Club',
  startDate: '2026-05-11',
  endDate: '2026-05-11',
} as Show;

const trials = fromAny<DbTrial[], unknown>([
  {
    id: 'trial-1',
    trial_number: 1,
    date: '2026-05-11',
    registry_id: 'AKC',
  },
]);

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
  // check-in-sheet renders from the shared PDF renderer as of Task 6, so this
  // markup-path regression test moved to results-sheet — another
  // class-scoped report using the same `TrialInfoBox`/`resolveClassJudgeName`
  // path this test exercises. The PDF path's own judge-name coverage is
  // `toScoresheetModel.test.ts`'s "resolves the class judge from an
  // assignment over a stale denormalised name, and prints it".
  it('renders assignment-backed class judges in results sheet previews', async () => {
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
        reportType="results-sheet"
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
        dataState="ready"
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
        dataState="ready"
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
        dataState="ready"
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
        dataState="loading"
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
        dataState="error"
        onRetry={onRetry}
      />
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'assertive');

    const retry = screen.getByRole('button', { name: 'Try again' });
    await userEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  describe('PDF-backed reports (check-in sheet, scoresheet)', () => {
    const originalCheckInBuildPdf = getReportById('check-in-sheet')!.buildPdf;

    afterEach(() => {
      getReportById('check-in-sheet')!.buildPdf = originalCheckInBuildPdf;
    });

    it('renders the check-in sheet PDF into the iframe via an object URL', async () => {
      render(
        <ReportPreview
          reportType="check-in-sheet"
          show={show}
          trials={trials}
          classes={classes}
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
        expect(iframe.src).toMatch(/^blob:/);
      });
    });

    it('shows an inline error with a retry when the PDF renderer throws', async () => {
      const buildPdf = vi.fn(() => {
        throw new Error('Emergency packet is too large to upload.');
      });
      getReportById('check-in-sheet')!.buildPdf = buildPdf;

      render(
        <ReportPreview
          reportType="check-in-sheet"
          show={show}
          trials={trials}
          classes={classes}
          entries={[entries[0]!]}
          trialId="trial-1"
          classId="class-1"
          dogId="all"
          sortOrder="run-order"
          isLoading={false}
          isError={false}
        />
      );

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Emergency packet is too large to upload.');
      expect(buildPdf).toHaveBeenCalledTimes(1);

      const retry = screen.getByRole('button', { name: 'Try again' });
      await userEvent.click(retry);
      expect(buildPdf).toHaveBeenCalledTimes(2);
    });
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
        dataState="error"
      />
    );

    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  describe('states that used to be indistinguishable', () => {
    it('says the entries could not be CHECKED, not that there are none', () => {
      render(
        <ReportPreview
          reportType="check-in-sheet"
          show={show}
          trials={trials}
          classes={classes}
          entries={undefined}
          trialId="all"
          classId="all"
          dogId="all"
          sortOrder="run-order"
          isLoading={false}
          isError={false}
          dataState="unavailable"
        />
      );

      expect(screen.getByText(/could not be checked/i)).toBeInTheDocument();
      // The whole point: the old copy asserted something about the CLASS.
      expect(screen.queryByText(/No entries found/i)).toBeNull();
    });

    it('tells the secretary a download-only form downloads, when one is offered', () => {
      render(
        <ReportPreview
          reportType="asca-scent-detection-trial-roster"
          show={show}
          trials={trials}
          classes={classes}
          entries={entries}
          trialId="trial-1"
          classId="all"
          dogId="all"
          sortOrder="armband"
          isLoading={false}
          isError={false}
          dataState="ready"
          hasDownloadAction
        />
      );

      expect(screen.getByText(/is a downloadable form/i)).toBeInTheDocument();
      expect(screen.queryByText(/different registry/i)).toBeNull();
    });

    it('does not claim a registry mismatch merely because the download is not pressable yet', () => {
      // The regression this guards: hasDownloadAction was derived from
      // `!disabled`, so the default state (no trial picked) printed "this form
      // belongs to a different registry" -- contradicting the "Pick a trial
      // above" line in the controls bar directly above it.
      render(
        <ReportPreview
          reportType="asca-scent-detection-trial-roster"
          show={show}
          trials={trials}
          classes={classes}
          entries={entries}
          trialId="all"
          classId="all"
          dogId="all"
          sortOrder="armband"
          isLoading={false}
          isError={false}
          dataState="ready"
          hasDownloadAction
          downloadBlockedReason="Pick a trial above to enable this."
        />
      );

      expect(screen.queryByText(/different registry/i)).toBeNull();
      expect(screen.getByText(/Pick a trial above to enable this/i)).toBeInTheDocument();
    });

    it('does say so when the form really is for another registry', () => {
      render(
        <ReportPreview
          reportType="asca-scent-detection-trial-roster"
          show={show}
          trials={trials}
          classes={classes}
          entries={entries}
          trialId="trial-1"
          classId="all"
          dogId="all"
          sortOrder="armband"
          isLoading={false}
          isError={false}
          dataState="ready"
          hasDownloadAction={false}
        />
      );

      expect(screen.getByText(/different registry/i)).toBeInTheDocument();
    });

    it('reports a missing show as settled, not as loading forever', () => {
      // With no show there is no showId, so the trials query is enabled:false
      // and isPending forever -- which reads as 'loading'. Checked first.
      render(
        <ReportPreview
          reportType="check-in-sheet"
          show={null}
          trials={undefined}
          classes={undefined}
          entries={undefined}
          trialId="all"
          classId="all"
          dogId="all"
          sortOrder="run-order"
          isLoading={true}
          isError={false}
          dataState="loading"
        />
      );

      expect(screen.getByText(/This show could not be loaded/i)).toBeInTheDocument();
      expect(screen.queryByText(/Loading report data/i)).toBeNull();
    });
  });

});
